import { CharacterRegistry } from '../registry/character-registry';
import type { EnginePlayerState, EngineSnapshot, GamePrompt } from '../types/game';
import type { GameEvent } from '../types/event';
import { GameEventType } from '../types/event';
import {
  createInitialGameState,
  snapshotState,
  type GameState,
} from '../state/game-state';
import { ResolutionStack } from '../resolution/resolution-stack';
import { TargetQueue } from '../resolution/target-queue';
import {
  EventResolver,
  createDamageEvent,
  type EventResolverHost,
} from '../resolution/event-resolver';
import { CardPlayService } from '../resolution/card-play-service';
import { SkillPlayService } from '../resolution/skill-play-service';
import {
  getCardPlayContext,
  getZonePickContext,
  setCardPlayContext,
  setZonePickContext,
} from '../resolution/card-play-context';
import { TurnRunner, type TurnRunnerHost } from './turn-runner';
import { TurnPhaseMachine } from '../fsm/turn-phase-machine';
import { normalizeHandEntry } from '../engine/card-label';
import type { PendingJudge } from '../engine/judge-runner';
import { RuleManager } from '../rules/rule-manager';
import { ConfigRuleLoader } from '../rules/config-rule-loader';
import { DeckPile } from '../engine/deck-pile';
import type { RoomPlayerInput } from '../engine/game-engine';

let eventIdSeq = 0;

function nextEventId(): string {
  eventIdSeq += 1;
  return `evt_${eventIdSeq}`;
}

export interface SangokushiEngineOptions {
  players: EnginePlayerState[];
}

/**
 * 配置驱动引擎：杀 → 闪 → 伤害（栈）→ 受伤后技能（奸雄/反馈等配置触发）。
 */
export class SangokushiEngine implements EventResolverHost, TurnRunnerHost {
  readonly state: GameState;
  readonly fsm = new TurnPhaseMachine();
  readonly stack = new ResolutionStack();
  readonly rules: RuleManager;
  readonly resolver: EventResolver;
  readonly cardPlay = new CardPlayService();
  readonly skillPlay = new SkillPlayService();
  private readonly turnRunner: TurnRunner;
  private readonly deck: DeckPile;
  private targetQueue: TargetQueue | null = null;
  private pendingJudge: PendingJudge | null = null;

  static findLordIndex(players: { role?: string }[]): number {
    const idx = players.findIndex((p) => p.role === '主公');
    return idx >= 0 ? idx : 0;
  }

  static fromRoomPlayers(inputs: RoomPlayerInput[]): EnginePlayerState[] {
    return inputs.map((p, i) => {
      const ch = CharacterRegistry.resolve(p.general ?? p.nickname);
      const isLord = p.role === '主公';
      const maxHp = (p.maxHp ?? ch?.maxHp ?? 4) + (isLord ? 1 : 0);
      return {
        id: p.id,
        seat: p.seat ?? i + 1,
        nickname: p.nickname,
        generalId: ch?.id ?? 'unknown',
        generalName: ch?.name ?? p.general ?? p.nickname,
        role: p.role ?? '反贼',
        kingdom: ch?.kingdom ?? 'qun',
        hp: p.hp ?? maxHp,
        maxHp,
        handCards: [...(p.handCards ?? [])],
        equipment: [...(p.equipment ?? [])],
        judgeCards: [...(p.judgeCards ?? [])],
        shaUsedCount: 0,
        skillUseCount: {},
      };
    });
  }

  constructor(options: SangokushiEngineOptions | { roomPlayers: RoomPlayerInput[] }) {
    const players =
      'roomPlayers' in options
        ? SangokushiEngine.fromRoomPlayers(options.roomPlayers)
        : options.players;
    this.deck = new DeckPile();
    this.deck.reset();
    for (const p of players) {
      p.handCards = p.handCards.map((c) => normalizeHandEntry(c));
    }
    this.state = createInitialGameState(players, this.deck.remaining());
    this.rules = new RuleManager();
    this.rules.registerAll(new ConfigRuleLoader().loadAll());
    this.resolver = new EventResolver(this.rules);
    this.turnRunner = new TurnRunner(this);
    this.fsm.set('judge');
  }

  getFsm(): TurnPhaseMachine {
    return this.fsm;
  }

  getPendingJudge(): PendingJudge | null {
    return this.pendingJudge;
  }

  setPendingJudge(p: PendingJudge | null): void {
    this.pendingJudge = p;
  }

  getState(): GameState {
    return this.state;
  }

  getDeck(): DeckPile {
    return this.deck;
  }

  getSnapshot(): EngineSnapshot {
    return {
      turnIndex: this.state.turn.index,
      round: this.state.turn.round,
      turnPhase: this.state.turn.phase,
      log: [...this.state.log],
      prompt: this.state.prompt,
      players: this.state.players.map((p) => ({
        ...p,
        handCards: [...p.handCards],
      })),
      pendingJudge: this.pendingJudge
        ? {
            targetPlayerId: this.pendingJudge.targetPlayerId,
            judgeCardName: this.pendingJudge.judgeCardName,
            result: { ...this.pendingJudge.result },
            modifyQueue: [...this.pendingJudge.modifyQueue],
            modifyIndex: this.pendingJudge.modifyIndex,
            modified: this.pendingJudge.modified,
          }
        : undefined,
    };
  }

  setPrompt(prompt: GamePrompt | null): void {
    this.state.prompt = prompt;
  }

  log(message: string): void {
    this.state.log.unshift(message);
  }

  snapshot(): GameState {
    return snapshotState(this.state);
  }

  /** 开局：定位主公，发初始手牌，从判定阶段开始完整回合 */
  start(): void {
    this.deck.reset();
    this.state.turn.index = SangokushiEngine.findLordIndex(
      this.state.players.map((p) => ({ role: p.role })),
    );
    this.state.turn.round = 1;
    this.pendingJudge = null;
    this.setPrompt(null);
    const lord = this.state.players[this.state.turn.index];
    this.log(`【开局】从主公 ${lord?.generalName ?? lord?.nickname} 开始`);
    this.turnRunner.dealOpeningHands(4);
    this.turnRunner.beginTurn();
  }

  // —— 用牌（配置驱动） ——

  initiatePlayCard(
    sourceId: string,
    cardName: string,
    handIndex?: number,
  ): { ok: boolean; error?: string } {
    const cur = this.state.players[this.state.turn.index];
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    return this.cardPlay.initiatePlayCard(this, sourceId, cardName, handIndex);
  }

  confirmPlayCard(
    sourceId: string,
    promptId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = this.cardPlay.confirmPlayCard(this, sourceId, promptId);
    if (!res.ok) return Promise.resolve(res);
    if (this.state.prompt?.type === 'select_targets') {
      return Promise.resolve(res);
    }
    return this.continueAfterCardPlayStart(res);
  }

  selectTargets(
    sourceId: string,
    promptId: string,
    targetIds: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    const res = this.cardPlay.selectTargets(this, sourceId, promptId, targetIds);
    if (!res.ok) return Promise.resolve(res);
    return this.continueAfterCardPlayStart(res);
  }

  private async continueAfterCardPlayStart(res: {
    ok: boolean;
    error?: string;
    paused?: boolean;
    scheduleAoe?: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!res.ok) return res;
    if (res.scheduleAoe) {
      await this.drainStack();
      return { ok: true };
    }
    if (res.paused || this.state.prompt) return { ok: true };
    return { ok: true };
  }

  async submitPromptChoice(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const prompt = this.state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }

    if (choiceId === 'cancel' && prompt.type === 'select_zone_card') {
      this.cardPlay.cancelPlay(this);
      return Promise.resolve({ ok: true });
    }

    if (choiceId === 'cancel' && prompt.type === 'play_card_confirm') {
      this.cardPlay.cancelPlay(this);
      return { ok: true };
    }

    if (choiceId === 'confirm' && prompt.type === 'play_card_confirm') {
      return this.confirmPlayCard(playerId, promptId);
    }

    if (prompt.type === 'use_skill') {
      if (prompt.skillId && choiceId === `${prompt.skillId}:finish`) {
        return Promise.resolve(this.skillPlay.finish(this, playerId));
      }
      if (choiceId === 'cancel' && prompt.skillId) {
        this.setPrompt(null);
        if (this.state.turn.phase === 'play') {
          const cur = this.state.players[this.state.turn.index];
          this.log(
            `—— ${cur?.generalName ?? '角色'} 出牌阶段：可选择出牌、发动技能或结束回合`,
          );
        }
        return Promise.resolve({ ok: true });
      }
    }

    if (prompt.type === 'use_skill') {
      if (choiceId === 'skip') {
        this.rules.skipReactiveSkill({
          state: this.state,
          event: { id: '_', type: GameEventType.TAKE_DAMAGE, payload: {} },
          phase: 'post',
          log: (m) => this.log(m),
        });
        this.setPrompt(null);
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        return { ok: true };
      }
      if (choiceId.startsWith('skill:')) {
        const skillId = choiceId.slice(6);
        const event =
          (this.state.resolution.context.lastDamageEvent as GameEvent | undefined) ??
          this.stack.peek();
        if (event) {
          await this.rules.confirmReactiveSkill(
            {
              state: this.state,
              event,
              phase: 'post',
              log: (m) => this.log(m),
              deck: this.deck,
            },
            playerId,
            skillId,
          );
        }
        this.setPrompt(null);
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        return { ok: true };
      }
    }

    if (prompt.type === 'response') {
      return this.submitResponse(playerId, promptId, choiceId);
    }

    return { ok: false, error: '无效选择' };
  }

  submitResponse(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.cardPlay.submitResponse(
      this,
      playerId,
      promptId,
      choiceId,
      (p) => this.applyDamage(p),
    );
  }

  /** 伤害入栈并结算（含 AFTER_DAMAGE 与奸雄/反馈询问） */
  async applyDamage(params: {
    sourceId: string;
    targetId: string;
    amount: number;
    damageCardName?: string;
  }): Promise<void> {
    const event = createDamageEvent({
      id: nextEventId(),
      sourcePlayerId: params.sourceId,
      targetPlayerId: params.targetId,
      amount: params.amount,
      damageCardName: params.damageCardName,
    });
    this.stack.push(event);
    this.syncStackToState();
    await this.drainStack();
  }

  async onExecuteCore(event: GameEvent): Promise<void> {
    if (event.type === GameEventType.TARGET_RESOLVE) {
      const targetId = event.payload.targetPlayerIds?.[0];
      if (targetId) {
        this.cardPlay.resolveTargetResponse(this, targetId);
      }
      return;
    }

    if (event.type === GameEventType.TAKE_DAMAGE) {
      const sourceId = event.payload.sourcePlayerId;
      const source = sourceId
        ? this.state.players.find((p) => p.id === sourceId)
        : undefined;
      const targetIds = event.payload.targetPlayerIds ?? [];
      const victim = this.state.players.find((p) => targetIds.includes(p.id));
      const amount = event.payload.amount ?? 1;
      if (!victim || !source) return;

      this.rules.effects.runOne(
        { action: 'damage', params: { amount } },
        {
          state: this.state,
          event,
          source,
          targets: [victim],
          log: (m) => this.log(m),
          deck: this.deck,
        },
      );
      if (victim.hp <= 0) {
        this.log(`${victim.generalName} 进入濒死`);
      }
    }
  }

  scheduleAoeTargets(sourcePlayerId: string, targetPlayerIds: string[]): void {
    this.targetQueue = new TargetQueue(targetPlayerIds);
    this.state.resolution.targetQueue = [...targetPlayerIds];
    this.pushNextAoeTargetEvent(sourcePlayerId);
  }

  /** 当前 TARGET_RESOLVE 响应完毕：出栈并调度下一目标 */
  completeTargetResolve(): void {
    const event = this.stack.peek();
    if (event?.type !== GameEventType.TARGET_RESOLVE) return;
    this.stack.pop();
    const sourceId = event.payload.sourcePlayerId;
    if (this.targetQueue) {
      this.targetQueue.shift();
      if (sourceId) this.pushNextAoeTargetEvent(sourceId);
    }
    this.syncStackToState();
  }

  private pushNextAoeTargetEvent(sourcePlayerId: string): void {
    if (this.targetQueue && !this.targetQueue.isEmpty) {
      const targetId = this.targetQueue.peek()!;
      this.stack.push({
        id: nextEventId(),
        type: GameEventType.TARGET_RESOLVE,
        payload: { sourcePlayerId, targetPlayerIds: [targetId] },
      });
      this.syncStackToState();
      return;
    }
    this.state.resolution.targetQueue = null;
    this.targetQueue = null;
  }

  async drainStack(): Promise<{ paused: boolean }> {
    while (this.stack.depth > 0) {
      if (this.state.prompt) return { paused: true };

      const event = this.stack.peek();
      if (!event) break;

      const result = await this.resolver.resolve(this, event);
      if (result.executeFinished) {
        if (event.type === GameEventType.TAKE_DAMAGE) {
          this.state.resolution.context.lastDamageEvent = { ...event };
        }
        this.stack.pop();
        this.syncStackToState();

        if (
          event.type === GameEventType.TARGET_RESOLVE &&
          !this.state.prompt
        ) {
          const sourceId = event.payload.sourcePlayerId;
          if (this.targetQueue && sourceId) {
            this.targetQueue.shift();
            this.pushNextAoeTargetEvent(sourceId);
          }
        }
      }
      if (this.state.prompt || result.paused) return { paused: true };

      if (!result.executeFinished) {
        continue;
      }
    }
    return { paused: false };
  }

  enqueueDying(playerId: string): void {
    this.stack.pushUrgent({
      id: nextEventId(),
      type: GameEventType.DYING,
      payload: { targetPlayerIds: [playerId] },
      insertPriority: 1000,
    });
    this.syncStackToState();
  }

  endTurn(sourceId: string): { ok: boolean; error?: string } {
    if (this.state.prompt) {
      return {
        ok: false,
        error:
          this.state.prompt.type === 'discard_cards'
            ? '请先完成弃牌'
            : '请先处理当前提示',
      };
    }
    return this.turnRunner.endPlayPhase(sourceId);
  }

  initiateSkill(sourceId: string, skillId: string): { ok: boolean; error?: string } {
    return this.skillPlay.initiate(this, sourceId, skillId);
  }

  rendeGive(
    sourceId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): { ok: boolean; error?: string } {
    return this.skillPlay.giveCards(this, sourceId, targetId, cards, handIndices);
  }

  rendeFinish(sourceId: string): { ok: boolean; error?: string } {
    return this.skillPlay.finish(this, sourceId);
  }

  zhihengConfirm(_sourceId: string, _handIndices: number[]): { ok: boolean; error?: string } {
    return { ok: false, error: '制衡尚未接入通用技能流程' };
  }

  submitModifyJudge(
    sourceId: string,
    promptId: string,
    handIndex: number,
  ): { ok: boolean; error?: string } {
    return this.turnRunner.submitModifyJudge(sourceId, promptId, handIndex);
  }

  skipModifyJudge(sourceId: string, promptId: string): { ok: boolean; error?: string } {
    return this.turnRunner.skipModifyJudge(sourceId, promptId);
  }

  submitDiscard(
    sourceId: string,
    promptId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    return this.turnRunner.submitDiscard(sourceId, promptId, handIndices);
  }

  submitZoneCard(
    sourceId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    return this.cardPlay.submitZoneCardSelection(
      this,
      sourceId,
      promptId,
      choiceId,
    );
  }

  /** 断线重连：将引擎内玩家 id 从旧 socket id 迁移到新 id */
  remapPlayerId(oldId: string, newId: string): void {
    if (oldId === newId) return;

    const player = this.state.players.find((p) => p.id === oldId);
    if (player) player.id = newId;

    const prompt = this.state.prompt;
    if (prompt) {
      if (prompt.playerId === oldId) prompt.playerId = newId;
      if (prompt.sourcePlayerId === oldId) prompt.sourcePlayerId = newId;
      if (prompt.judgeTargetId === oldId) prompt.judgeTargetId = newId;
      if (prompt.targetPlayerIds) {
        prompt.targetPlayerIds = prompt.targetPlayerIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
      if (prompt.validTargetIds) {
        prompt.validTargetIds = prompt.validTargetIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
    }

    const ctx = this.state.resolution.context;
    const cardPlay = getCardPlayContext(ctx);
    if (cardPlay) {
      if (cardPlay.sourcePlayerId === oldId) cardPlay.sourcePlayerId = newId;
      if (cardPlay.awaitingResponseFrom === oldId) {
        cardPlay.awaitingResponseFrom = newId;
      }
      cardPlay.targetPlayerIds = cardPlay.targetPlayerIds.map((id) =>
        id === oldId ? newId : id,
      );
      setCardPlayContext(ctx, cardPlay);
    }

    const zonePick = getZonePickContext(ctx);
    if (zonePick) {
      if (zonePick.sourcePlayerId === oldId) zonePick.sourcePlayerId = newId;
      if (zonePick.targetPlayerId === oldId) zonePick.targetPlayerId = newId;
      setZonePickContext(ctx, zonePick);
    }

    const pending = ctx.pendingReactive as
      | { playerId: string; eventId: string; skillId: string }
      | undefined;
    if (pending?.playerId === oldId) pending.playerId = newId;

    if (this.state.resolution.targetQueue) {
      this.state.resolution.targetQueue = this.state.resolution.targetQueue.map(
        (id) => (id === oldId ? newId : id),
      );
    }

    if (this.pendingJudge?.targetPlayerId === oldId) {
      this.pendingJudge = { ...this.pendingJudge, targetPlayerId: newId };
    }

    for (const event of this.stack.toArray()) {
      if (event.payload.sourcePlayerId === oldId) {
        event.payload.sourcePlayerId = newId;
      }
      if (event.payload.targetPlayerIds) {
        event.payload.targetPlayerIds = event.payload.targetPlayerIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
    }
    this.syncStackToState();
  }

  private syncStackToState(): void {
    this.state.resolution.stack = [...this.stack.toArray()];
    this.state.deck.remaining = this.deck.remaining();
  }
}
