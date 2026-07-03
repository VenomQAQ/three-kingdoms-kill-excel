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
  getDyingRescueContext,
  getZonePickContext,
  setCardPlayContext,
  setDyingRescueContext,
  setZonePickContext,
} from '../resolution/card-play-context';
import { cardNameFromHandEntry } from '../engine/card-label';
import { removeCardFromHand } from '../engine/effect-runner';
import { nextPromptId } from '../utils/prompt-id';
import { TurnRunner, type TurnRunnerHost } from './turn-runner';
import { TurnPhaseMachine } from '../fsm/turn-phase-machine';
import { normalizeHandEntry } from '../engine/card-label';
import type { PendingJudge } from '../engine/judge-runner';
import {
  collectOptionalSkillOffers,
  runSkillEffects,
} from '../engine/timing-runner';
import { GameTiming } from '../types/timing';
import { RuleManager } from '../rules/rule-manager';
import { ConfigRuleLoader } from '../rules/config-rule-loader';
import { DeckPile } from '../engine/deck-pile';
import type { RoomPlayerInput } from '../engine/game-engine';
import { checkVictory } from './identity';
import { discardOneFromZone } from '../engine/equipment-zone';

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
        roleRevealed: p.role === '主公',
        kingdom: ch?.kingdom ?? 'qun',
        hp: p.hp ?? maxHp,
        maxHp,
        handCards: [...(p.handCards ?? [])],
        equipment: [...(p.equipment ?? [])],
        judgeCards: [...(p.judgeCards ?? [])],
        shaUsedCount: 0,
        skillUseCount: {},
        skillTargetUseCount: {},
        dead: false,
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

  startJudgePhase(): void {
    this.turnRunner.startJudgePhase();
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
        skillTargetUseCount: { ...p.skillTargetUseCount },
      })),
      victory: this.state.victory ?? null,
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
    zoneCardId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = this.cardPlay.selectTargets(this, sourceId, promptId, targetIds, zoneCardId);
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

    if (
      choiceId === 'cancel' &&
      (prompt.type === 'select_targets' ||
        prompt.type === 'select_zone_card' ||
        prompt.type === 'play_card_confirm')
    ) {
      this.cardPlay.cancelPlay(this);
      return { ok: true };
    }

    if (choiceId === 'confirm' && prompt.type === 'play_card_confirm') {
      return this.confirmPlayCard(playerId, promptId);
    }

    if (prompt.type === 'use_skill') {
      if (prompt.skillId === 'jianyan' && choiceId.startsWith('jianyan:')) {
        const targetId = prompt.validTargetIds?.[0];
        if (!targetId) {
          return { ok: false, error: '荐言缺少目标' };
        }
        const res = this.skillPlay.executeJianyan(this, playerId, choiceId, targetId);
        if (!res.ok) {
          return Promise.resolve(res);
        }
        const cur = this.state.players[this.state.turn.index];
        this.log(`-- ${cur?.generalName ?? '角色'} 出牌阶段：可继续出牌、发动技能或结束回合`);
        return Promise.resolve({ ok: true });
      }
      if (this.state.turn.phase === 'prepare') {
        if (choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.startJudgePhase();
          return { ok: true };
        }
        if (choiceId.startsWith('skill:')) {
          const skillId = choiceId.slice(6);
          const currentPlayer = this.state.players[this.state.turn.index];
          if (!currentPlayer || currentPlayer.id !== playerId) {
            return { ok: false, error: '不是你的回合' };
          }
          const offers = collectOptionalSkillOffers(currentPlayer, GameTiming.TURN_START);
          const offer = offers.find((item) => item.skill.id === skillId);
          if (!offer) {
            return { ok: false, error: '当前时机不能发动此技能' };
          }
          currentPlayer.skillUseCount[skillId] =
            (currentPlayer.skillUseCount[skillId] ?? 0) + 1;
          if (skillId === 'guanxing') {
            const aliveCount = this.state.players.filter((player) => player.hp > 0).length;
            const count = Math.min(5, aliveCount);
            const cards = this.deck.peekTop(count);
            this.setPrompt({
              id: nextPromptId(),
              type: 'use_skill',
              playerId,
              skillId: 'guanxing',
              skillName: offer.skill.name,
              guanxingCards: cards,
              message: `${currentPlayer.generalName} 发动【${offer.skill.name}】，请调整牌堆顶 ${cards.length} 张牌`,
              options: [{ id: 'guanxing:confirm', label: '确认观星' }],
            });
            return { ok: true };
          }
          runSkillEffects(currentPlayer, offer.skill, (message) => this.log(message), this.deck);
          this.setPrompt(null);
          this.turnRunner.startJudgePhase();
          return { ok: true };
        }
      }
      if (prompt.skillId === 'guanxing' && choiceId.startsWith('guanxing:confirm')) {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        const [, , topCountText, orderText] = choiceId.split(':');
        const originalCards = prompt.guanxingCards ?? [];
        const topCount = Math.max(0, Math.min(originalCards.length, Number(topCountText) || 0));
        const indices = (orderText ?? '')
          .split(',')
          .filter(Boolean)
          .map((value) => Number(value));
        if (
          indices.length !== originalCards.length ||
          new Set(indices).size !== originalCards.length ||
          indices.some((index) => index < 0 || index >= originalCards.length)
        ) {
          return { ok: false, error: '观星顺序无效' };
        }
        const arranged = indices.map((index) => originalCards[index]!);
        this.deck.arrangeTop(arranged, topCount);
        this.log(
          `${currentPlayer.generalName} 发动【观星】，将 ${topCount} 张置于牌堆顶，${arranged.length - topCount} 张置于牌堆底`,
        );
        this.setPrompt(null);
        this.turnRunner.startJudgePhase();
        return { ok: true };
      }
      if (prompt.skillId === 'xunxun' && choiceId.startsWith('xunxun:confirm')) {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        const [, , topCountText, orderText] = choiceId.split(':');
        const originalCards = prompt.guanxingCards ?? [];
        const topCount = Math.max(
          0,
          Math.min(originalCards.length, Number(topCountText) || 0),
        );
        const indices = (orderText ?? '')
          .split(',')
          .filter(Boolean)
          .map((value) => Number(value));
        if (
          indices.length !== originalCards.length ||
          new Set(indices).size !== originalCards.length ||
          indices.some((index) => index < 0 || index >= originalCards.length)
        ) {
          return { ok: false, error: '恂恂调整顺序无效' };
        }
        const arranged = indices.map((index) => originalCards[index]!);
        this.deck.arrangeTop(arranged, topCount);
        this.log(
          `${currentPlayer.generalName} 发动【恂恂】，将 ${topCount} 张置于牌堆顶，${arranged.length - topCount} 张置于牌堆底`,
        );
        this.setPrompt(null);
        this.turnRunner.performDraw();
        return { ok: true };
      }
      if (this.state.turn.phase === 'before_draw') {
        if (choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.performDraw();
          return { ok: true };
        }
        if (choiceId.startsWith('skill:')) {
          const skillId = choiceId.slice(6);
          const currentPlayer = this.state.players[this.state.turn.index];
          if (!currentPlayer || currentPlayer.id !== playerId) {
            return { ok: false, error: '不是你的回合' };
          }
          const offers = collectOptionalSkillOffers(currentPlayer, GameTiming.BEFORE_DRAW);
          const offer = offers.find((item) => item.skill.id === skillId);
          if (!offer) {
            return { ok: false, error: '当前时机不能发动此技能' };
          }
          currentPlayer.skillUseCount[skillId] =
            (currentPlayer.skillUseCount[skillId] ?? 0) + 1;

          // 恂恂：观看牌堆顶4张，选2张置顶、其余置底
          if (skillId === 'xunxun') {
            const count = (offer.skill.effects?.[0]?.params?.count as number) ?? 4;
            const arrangeTop = (offer.skill.effects?.[0]?.params?.arrange as number) ?? 2;
            const cards = this.deck.peekTop(count);
            this.log(`${currentPlayer.generalName} 发动【${offer.skill.name}】`);
            this.setPrompt({
              id: nextPromptId(),
              type: 'use_skill',
              playerId,
              skillId: 'xunxun',
              skillName: offer.skill.name,
              guanxingCards: cards,
              message: `${currentPlayer.generalName} 发动【${offer.skill.name}】，请将 ${arrangeTop} 张置于牌堆顶，其余置于牌堆底`,
              options: [{ id: 'xunxun:confirm', label: '确认调整' }],
            });
            return { ok: true };
          }

          if (skillId === 'tuxi') {
            const others = this.state.players.filter(
              (p) =>
                p.id !== currentPlayer.id &&
                p.hp > 0 &&
                !p.dead &&
                p.handCards.length > 0,
            );
            const stealCount = Math.min(2, others.length);
            for (let i = 0; i < stealCount; i++) {
              const target = others[i]!;
              const idx = Math.floor(Math.random() * target.handCards.length);
              const card = target.handCards.splice(idx, 1)[0]!;
              currentPlayer.handCards.push(card);
              this.log(
                `${currentPlayer.generalName}【突袭】获得 ${target.generalName} 的一张手牌`,
              );
            }
            currentPlayer.skillUseCount['_tuxi_skip'] = stealCount;
            this.setPrompt(null);
            this.turnRunner.performDraw();
            return { ok: true };
          }

          this.log(`${currentPlayer.generalName} 发动【${offer.skill.name}】`);
          runSkillEffects(currentPlayer, offer.skill, (message) => this.log(message), this.deck);
          this.setPrompt(null);
          this.turnRunner.performDraw();
          return { ok: true };
        }
      }
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

    if (prompt.type === 'dying_rescue') {
      return this.submitDyingRescue(playerId, promptId, choiceId);
    }

    if (prompt.type === 'pick_revealed') {
      const res = this.cardPlay.submitPickRevealed(this, playerId, promptId, choiceId);
      return Promise.resolve(res);
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
    if (this.state.prompt?.type === 'dying_rescue') {
      return this.submitDyingRescue(playerId, promptId, choiceId);
    }
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
        this.state.lastDamageSourceId = sourceId ?? null;
        this.enqueueDying(victim.id);
      }
      return;
    }

    if (event.type === GameEventType.DYING) {
      const targetId = event.payload.targetPlayerIds?.[0];
      const dyingPlayer = this.state.players.find((player) => player.id === targetId);
      if (!dyingPlayer || dyingPlayer.hp > 0) return;
      this.log(`${dyingPlayer.generalName} 进入濒死`);
      this.beginDyingRescue(dyingPlayer.id);
    }
  }

  private beginDyingRescue(dyingPlayerId: string): void {
    const players = this.state.players;
    const dyingPlayer = players.find((player) => player.id === dyingPlayerId);
    if (!dyingPlayer || dyingPlayer.hp > 0) return;

    const turnIndex = Math.max(0, Math.min(this.state.turn.index, players.length - 1));
    const queue = players
      .slice(turnIndex)
      .concat(players.slice(0, turnIndex))
      .filter((player) => player.hp > 0 || player.id === dyingPlayerId)
      .map((player) => player.id);

    setDyingRescueContext(this.state.resolution.context, {
      dyingPlayerId,
      queue,
      index: 0,
    });
    this.promptNextDyingRescue();
  }

  private promptNextDyingRescue(): void {
    const context = getDyingRescueContext(this.state.resolution.context);
    if (!context) return;

    const dyingPlayer = this.state.players.find(
      (player) => player.id === context.dyingPlayerId,
    );
    if (!dyingPlayer || dyingPlayer.hp > 0) {
      setDyingRescueContext(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return;
    }

    while (context.index < context.queue.length) {
      const rescuerId = context.queue[context.index]!;
      const rescuer = this.state.players.find((player) => player.id === rescuerId);
      if (!rescuer || (rescuer.hp <= 0 && rescuer.id !== dyingPlayer.id)) {
        context.index += 1;
        continue;
      }

      const validCards = rescuer.handCards.filter((entry) => {
        const cardName = cardNameFromHandEntry(entry);
        return cardName === '桃' || (rescuer.id === dyingPlayer.id && cardName === '酒');
      });
      const options = validCards.map((card) => ({
        id: `card:${card}`,
        label: `使用【${cardNameFromHandEntry(card)}】`,
      }));

      this.setPrompt({
        id: nextPromptId(),
        type: 'dying_rescue',
        playerId: rescuer.id,
        dyingPlayerId: dyingPlayer.id,
        validResponseCards: validCards,
        message:
          rescuer.id === dyingPlayer.id
            ? `${dyingPlayer.generalName} 濒死：是否使用【桃】或【酒】自救？`
            : `${dyingPlayer.generalName} 濒死：${rescuer.generalName} 是否使用【桃】救助？`,
        options: [...options, { id: 'pass', label: '不救' }],
      });
      setDyingRescueContext(this.state.resolution.context, context);
      return;
    }

    this.log(`${dyingPlayer.generalName} 未被救回，濒死结算结束`);
    setDyingRescueContext(this.state.resolution.context, undefined);
    this.setPrompt(null);
    void this.handlePlayerDeath(dyingPlayer.id);
  }

  /** 角色死亡：公开身份、弃置所有牌、击杀奖惩、胜负判定 */
  private async handlePlayerDeath(playerId: string): Promise<void> {
    if (this.state.victory) return;
    const victim = this.state.players.find((p) => p.id === playerId);
    if (!victim || victim.dead) return;
    if (victim.hp > 0) return;

    victim.dead = true;
    victim.roleRevealed = true;
    this.log(`【阵亡】${victim.generalName}（${victim.role}）死亡，身份公开`);

    for (const card of victim.handCards.splice(0)) {
      this.deck.discardCard(card);
    }
    while (victim.equipment.length > 0) {
      discardOneFromZone(victim, 'equipment', this.deck, (m) => this.log(m));
    }
    while (victim.judgeCards.length > 0) {
      discardOneFromZone(victim, 'any', this.deck, (m) => this.log(m));
    }

    const killerId = this.state.lastDamageSourceId;
    const killer = killerId
      ? this.state.players.find((p) => p.id === killerId && p.hp > 0)
      : undefined;
    if (killer && victim.role === '反贼') {
      const drawn = this.deck.drawMany(3);
      killer.handCards.push(...drawn);
      this.log(`${killer.generalName} 击杀反贼，摸 3 张牌`);
    }
    if (killer?.role === '主公' && victim.role === '忠臣') {
      while (killer.handCards.length > 0) {
        this.deck.discardCard(killer.handCards.pop()!);
      }
      while (killer.equipment.length > 0) {
        discardOneFromZone(killer, 'equipment', this.deck, (m) => this.log(m));
      }
      this.log(`主公 ${killer.generalName} 误杀忠臣，弃置所有手牌和装备`);
    }

    const result = checkVictory(this.state.players);
    if (result) {
      this.state.victory = { winners: result.winners, message: result.message };
      this.log(`【游戏结束】${result.message}`);
      this.setPrompt(null);
      return;
    }

    await this.drainStack();
    await this.cardPlay.advanceAoeIfPending(this);
  }

  isGameOver(): boolean {
    return !!this.state.victory;
  }

  private async submitDyingRescue(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const prompt = this.state.prompt;
    const context = getDyingRescueContext(this.state.resolution.context);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'dying_rescue' || prompt.playerId !== playerId) {
      return { ok: false, error: '当前不能由你救助' };
    }

    const rescuer = this.state.players.find((player) => player.id === playerId);
    const dyingPlayer = this.state.players.find(
      (player) => player.id === context.dyingPlayerId,
    );
    if (!rescuer || !dyingPlayer) {
      setDyingRescueContext(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId.startsWith('card:')) {
      const cardEntry = choiceId.slice(5);
      const cardName = cardNameFromHandEntry(cardEntry);
      if (cardName !== '桃' && !(rescuer.id === dyingPlayer.id && cardName === '酒')) {
        return { ok: false, error: '此牌不能用于当前救助' };
      }
      if (!removeCardFromHand(rescuer, cardName)) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      this.deck.discardCard(cardEntry);
      dyingPlayer.hp = Math.min(dyingPlayer.maxHp, dyingPlayer.hp + 1);
      this.log(
        rescuer.id === dyingPlayer.id
          ? `${dyingPlayer.generalName} 使用【${cardName}】自救（${dyingPlayer.hp}/${dyingPlayer.maxHp}）`
          : `${rescuer.generalName} 对 ${dyingPlayer.generalName} 使用【桃】（${dyingPlayer.hp}/${dyingPlayer.maxHp}）`,
      );
      if (dyingPlayer.hp > 0) {
        setDyingRescueContext(this.state.resolution.context, undefined);
        this.setPrompt(null);
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        return { ok: true };
      }
    } else if (choiceId === 'pass') {
      this.log(`${rescuer.generalName} 放弃救助 ${dyingPlayer.generalName}`);
    } else {
      return { ok: false, error: '无效选择' };
    }

    context.index += 1;
    setDyingRescueContext(this.state.resolution.context, context);
    this.promptNextDyingRescue();
    if (!this.state.prompt) {
      await this.drainStack();
      await this.cardPlay.advanceAoeIfPending(this);
    }
    return { ok: true };
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
      if (result.executeFinished && this.stack.peek() !== event) {
        if (event.type === GameEventType.TAKE_DAMAGE) {
          this.state.resolution.context.lastDamageEvent = { ...event };
        }
        this.stack.remove(event.id);
        this.syncStackToState();
      } else if (result.executeFinished) {
        if (event.type === GameEventType.TAKE_DAMAGE) {
          this.state.resolution.context.lastDamageEvent = { ...event };
        }
        this.stack.pop();
        this.syncStackToState();
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
    const currentPlayer = this.state.players[this.state.turn.index];
    if (!currentPlayer || currentPlayer.id !== _sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.state.prompt?.skillId !== 'zhiheng') {
      return { ok: false, error: '当前未在制衡流程中' };
    }
    if (_handIndices.length === 0) {
      return { ok: false, error: '请至少选择一张手牌' };
    }

    const sorted = [..._handIndices].sort((left, right) => right - left);
    if (new Set(sorted).size !== _handIndices.length) {
      return { ok: false, error: '不能重复选择同一张手牌' };
    }

    const discarded: string[] = [];
    for (const index of sorted) {
      if (index < 0 || index >= currentPlayer.handCards.length) {
        return { ok: false, error: '所选手牌无效' };
      }
      const card = currentPlayer.handCards[index]!;
      currentPlayer.handCards.splice(index, 1);
      this.deck.discardCard(card);
      discarded.push(card);
    }

    const drawn = this.deck.drawMany(discarded.length);
    currentPlayer.handCards.push(...drawn);
    currentPlayer.skillUseCount.zhiheng =
      (currentPlayer.skillUseCount.zhiheng ?? 0) + 1;

    this.log(
      `${currentPlayer.generalName} 发动【制衡】，弃置 ${discarded.join('、')}，摸 ${drawn.length} 张牌`,
    );
    this.setPrompt(null);
    this.log(`-- ${currentPlayer.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    return { ok: true };
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

  cancelDiscard(sourceId: string, promptId: string): { ok: boolean; error?: string } {
    return this.turnRunner.cancelDiscard(sourceId, promptId);
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
