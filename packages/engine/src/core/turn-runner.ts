import { CharacterRegistry } from '../registry/character-registry';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameState } from '../state/game-state';
import { DeckPile } from '../engine/deck-pile';
import { TurnPhaseMachine } from '../fsm/turn-phase-machine';
import {
  applyJudgeEffect,
  collectModifyJudgePlayers,
  describeJudgeResult,
  type PendingJudge,
} from '../engine/judge-runner';
import { createCardInstance, formatCardInstance, judgeDelayEffect } from '../engine/card-instance';
import { cardNameFromHandEntry } from '../engine/card-label';
import { nextPromptId } from '../utils/prompt-id';
import {
  characterSkillsForPrompt,
  collectOptionalSkillOffers,
  playerHasSkill,
} from '../engine/timing-runner';
import { GameTiming } from '../types/timing';

export interface TurnRunnerHost {
  getState(): GameState;
  getDeck(): DeckPile;
  getFsm(): TurnPhaseMachine;
  log(message: string): void;
  setPrompt(prompt: GamePrompt | null): void;
  getPendingJudge(): PendingJudge | null;
  setPendingJudge(p: PendingJudge | null): void;
  startJudgePhase(): void;
}

/**
 * 回合宏观流程：判定 → 摸牌 → 出牌 → 弃牌 → 下一角色。
 * 与武将无关，延时锦囊判定复用 judge-runner。
 */
export class TurnRunner {
  private judgeQueue: { playerId: string; cardName: string }[] = [];

  constructor(private readonly host: TurnRunnerHost) {}

  currentPlayer(): EnginePlayerState | undefined {
    const s = this.host.getState();
    return s.players[s.turn.index];
  }

  beginTurn(): void {
    const cur = this.currentPlayer();
    if (!cur) return;
    if (cur.hp <= 0) {
      this.host.log(`${cur.generalName} 已阵亡，跳过回合`);
      this.finishTurnAfterDiscard();
      return;
    }
    cur.shaUsedCount = 0;
    cur.skillUseCount = {};
    cur.skillTargetUseCount = {};
    this.host.getFsm().set('prepare');
    this.host.getState().turn.phase = 'prepare';
    this.host.setPrompt(null);
    this.host.log(`—— ${cur.generalName} 的回合开始`);
    this.processPreparePhase();
  }

  private processPreparePhase(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    const offers = collectOptionalSkillOffers(cur, GameTiming.TURN_START).filter((offer) => {
      if (offer.skill.id !== 'tishen') return true;
      return cur.lastTurnEndHp != null && cur.hp < cur.lastTurnEndHp;
    });
    if (offers.length > 0) {
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: cur.id,
        characterSkills: characterSkillsForPrompt(cur),
        message: '准备阶段：是否发动技能？',
        options: [
          ...offers.map((offer) => ({
            id: `skill:${offer.skill.id}`,
            label: `发动【${offer.skill.name}】`,
          })),
          { id: 'skip', label: '不发动，进入判定' },
        ],
      });
      return;
    }

    this.processJudgePhase();
  }

  startJudgePhase(): void {
    this.processJudgePhase();
  }

  private processJudgePhase(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    this.judgeQueue = cur.judgeCards.map((name) => ({
      playerId: cur.id,
      cardName: cardNameFromHandEntry(name),
    }));

    this.host.getFsm().set('judge');
    this.host.getState().turn.phase = 'judge';

    if (this.judgeQueue.length === 0) {
      this.advanceToDraw();
      return;
    }

    this.host.getState().turn.phase = 'judge';
    this.resolveNextJudge();
  }

  private resolveNextJudge(): void {
    const item = this.judgeQueue.shift();
    if (!item) {
      this.advanceToDraw();
      return;
    }
    const player = this.host.getState().players.find((p) => p.id === item.playerId);
    if (!player) {
      this.resolveNextJudge();
      return;
    }

    const drawn = this.host.getDeck().drawOne();
    const result = createCardInstance(drawn ?? '杀');
    this.host.log(describeJudgeResult(player, item.cardName, result));

    const modifyQueue = collectModifyJudgePlayers(
      player,
      this.host.getState().players,
    );
    this.host.setPendingJudge({
      targetPlayerId: player.id,
      judgeCardName: item.cardName,
      result,
      modifyQueue,
      modifyIndex: 0,
      modified: false,
    });

    if (modifyQueue.length > 0) {
      this.offerModifyJudge();
      return;
    }

    this.finishJudgeResolution();
  }

  private offerModifyJudge(): void {
    const pending = this.host.getPendingJudge();
    if (!pending) return;

    while (pending.modifyIndex < pending.modifyQueue.length) {
      const modifierId = pending.modifyQueue[pending.modifyIndex]!;
      const modifier = this.host.getState().players.find((p) => p.id === modifierId);
      if (!modifier || modifier.hp <= 0 || modifier.handCards.length === 0) {
        pending.modifyIndex += 1;
        continue;
      }

      const target = this.host
        .getState()
        .players.find((p) => p.id === pending.targetPlayerId);
      const modSkill = CharacterRegistry.resolve(modifier.generalName)?.skills.find(
        (s) => s.effects?.some((e) => e.action === 'modifyJudge'),
      );
      const skillLabel = modSkill?.name ?? '改判';
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'modify_judge',
        playerId: modifier.id,
        judgeTargetId: pending.targetPlayerId,
        judgeCardName: pending.judgeCardName,
        judgeResult: formatCardInstance(pending.result),
        skillId: modSkill?.id,
        skillName: skillLabel,
        characterSkills: characterSkillsForPrompt(modifier),
        message: `${target?.generalName ?? '角色'} 的判定【${pending.judgeCardName}】为 ${formatCardInstance(pending.result)}，是否发动【${skillLabel}】？`,
        options: [{ id: 'skip', label: '不改判' }],
      });
      return;
    }

    this.finishJudgeResolution();
  }

  submitModifyJudge(
    modifierId: string,
    promptId: string,
    handIndex: number,
  ): { ok: boolean; error?: string } {
    const state = this.host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'modify_judge') {
      return { ok: false, error: '当前不是改判阶段' };
    }
    if (prompt.playerId !== modifierId) {
      return { ok: false, error: '不是你改判' };
    }
    const pending = this.host.getPendingJudge();
    if (!pending) return { ok: false, error: '无待处理判定' };

    const modifier = state.players.find((p) => p.id === modifierId);
    if (!modifier) return { ok: false, error: '角色不存在' };
    if (handIndex < 0 || handIndex >= modifier.handCards.length) {
      return { ok: false, error: '选手牌无效' };
    }

    const cardEntry = modifier.handCards[handIndex]!;
    modifier.handCards.splice(handIndex, 1);
    const replacement = createCardInstance(cardNameFromHandEntry(cardEntry));
    this.host.getDeck().discardCard(cardEntry);

    pending.result = replacement;
    pending.modified = true;
    const modSkill = CharacterRegistry.resolve(modifier.generalName)?.skills.find(
      (s) => s.effects?.some((e) => e.action === 'modifyJudge'),
    );
    this.host.log(
      `${modifier.generalName} 发动【${modSkill?.name ?? '改判'}】，以 ${formatCardInstance(replacement)} 代替判定结果`,
    );
    this.host.setPrompt(null);
    this.finishJudgeResolution();
    return { ok: true };
  }

  skipModifyJudge(modifierId: string, promptId: string): { ok: boolean; error?: string } {
    const state = this.host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'modify_judge') {
      return { ok: false, error: '当前不是改判阶段' };
    }
    if (prompt.playerId !== modifierId) {
      return { ok: false, error: '不是你改判' };
    }
    const pending = this.host.getPendingJudge();
    if (!pending) return { ok: false, error: '无待处理判定' };

    pending.modifyIndex += 1;
    this.host.setPrompt(null);
    this.offerModifyJudge();
    return { ok: true };
  }

  private finishJudgeResolution(): void {
    const pending = this.host.getPendingJudge();
    if (!pending) return;

    const player = this.host
      .getState()
      .players.find((p) => p.id === pending.targetPlayerId);
    if (!player) {
      this.host.setPendingJudge(null);
      this.resolveNextJudge();
      return;
    }

    const idx = player.judgeCards.findIndex(
      (c) => cardNameFromHandEntry(c) === pending.judgeCardName,
    );
    if (idx >= 0) player.judgeCards.splice(idx, 1);
    const judgeCardEntry = idx >= 0 ? pending.judgeCardName : undefined;

    const effect = applyJudgeEffect(
      player,
      pending.judgeCardName,
      pending.result,
    );
    if (effect.skipPlay) {
      player.skillUseCount['_skip_play'] = 1;
      this.host.log(
        `【${pending.judgeCardName}】生效，${player.generalName} 跳过出牌阶段`,
      );
    }
    if (effect.skipDraw) {
      player.skillUseCount['_skip_draw'] = 1;
      this.host.log(
        `【${pending.judgeCardName}】生效，${player.generalName} 跳过摸牌阶段`,
      );
    }
    if (effect.lightningDamage) {
      this.host.log('【闪电】生效');
      player.hp = Math.max(0, player.hp - effect.lightningDamage);
      this.host.log(
        `${player.generalName} 受到 ${effect.lightningDamage} 点雷电伤害（${player.hp}/${player.maxHp}）`,
      );
    }
    if (
      pending.judgeCardName === '闪电' &&
      judgeCardEntry &&
      !judgeDelayEffect(pending.judgeCardName, pending.result)
    ) {
      const nextPlayer = this.nextAlivePlayerAfter(player);
      if (nextPlayer) {
        nextPlayer.judgeCards.push(judgeCardEntry);
        this.host.log(`【闪电】未生效，移入 ${nextPlayer.generalName} 的判定区`);
      }
    }

    this.host.setPendingJudge(null);
    this.host.setPrompt(null);
    this.resolveNextJudge();
  }

  advanceToDraw(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    this.host.getState().turn.phase = 'before_draw';
    this.host.getFsm().set('before_draw');
    const offers = collectOptionalSkillOffers(cur, GameTiming.BEFORE_DRAW);
    if (offers.length > 0) {
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: cur.id,
        characterSkills: characterSkillsForPrompt(cur),
        message: '摸牌前：是否发动技能？',
        options: [
          ...offers.map((offer) => ({
            id: `skill:${offer.skill.id}`,
            label: `发动【${offer.skill.name}】`,
          })),
          { id: 'skip', label: '不发动，进入摸牌' },
        ],
      });
      return;
    }

    this.performDraw();
  }

  /** 直接进入摸牌结算：跳过 BEFORE_DRAW 时机的技能询问 */
  performDraw(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    if (cur.skillUseCount['_skip_draw']) {
      delete cur.skillUseCount['_skip_draw'];
      this.host.log(`${cur.generalName} 跳过摸牌阶段`);
      this.advanceToPlay();
      return;
    }

    this.host.getState().turn.phase = 'draw';
    this.host.getFsm().set('draw');
    const drawBase = 2 + (playerHasSkill(cur, 'yingzi') ? 1 : 0);
    const tuxiSkip = cur.skillUseCount['_tuxi_skip'] ?? 0;
    if (tuxiSkip > 0) delete cur.skillUseCount['_tuxi_skip'];
    const drawCount = Math.max(0, drawBase - tuxiSkip);
    const drawn = this.host.getDeck().drawMany(drawCount);
    cur.handCards.push(...drawn);
    this.host.log(
      `${cur.generalName} 摸牌阶段：摸 ${drawn.length} 张（牌堆余 ${this.host.getDeck().remaining()}，手牌 ${cur.handCards.length} 张）`,
    );
    this.advanceToPlay();
  }

  advanceToPlay(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    if (cur.skillUseCount['_skip_play']) {
      delete cur.skillUseCount['_skip_play'];
      this.host.log(`${cur.generalName} 跳过出牌阶段`);
      this.advanceToEnd();
      return;
    }

    this.host.getState().turn.phase = 'play';
    this.host.getFsm().set('play');
    this.host.setPrompt(null);
    this.host.log(
      `—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`,
    );
  }

  advanceToEnd(): void {
    void this.enterDiscardPhase();
  }

  endPlayPhase(playerId: string): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== playerId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }
    return this.enterDiscardPhase();
  }

  enterDiscardPhase(): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur) return { ok: false, error: '状态错误' };

    const limit = this.getHandLimit(cur);
    const excess = cur.handCards.length - limit;
    if (excess <= 0) {
      this.finishTurnAfterDiscard();
      return { ok: true };
    }

    this.host.getState().turn.phase = 'discard';
    this.host.getFsm().set('discard');
    this.host.setPrompt({
      id: nextPromptId(),
      type: 'discard_cards',
      playerId: cur.id,
      message: `弃牌阶段：手牌 ${cur.handCards.length} 张，当前体力 ${limit}，请弃置 ${excess} 张牌`,
      discardCount: excess,
      discardHandIndices: cur.handCards.map((_, i) => i),
      options: [{ id: 'confirm_discard', label: '确认弃牌' }],
    });
    return { ok: true };
  }

  submitDiscard(
    playerId: string,
    promptId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    const state = this.host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'discard_cards') {
      return { ok: false, error: '当前不是弃牌阶段' };
    }
    if (prompt.playerId !== playerId) {
      return { ok: false, error: '不是你弃牌' };
    }

    const cur = this.currentPlayer();
    if (!cur) return { ok: false, error: '状态错误' };

    const handLimit = this.getHandLimit(cur);
    const need = prompt.discardCount ?? 0;
    if (handIndices.length !== need) {
      return { ok: false, error: `请选择 ${need} 张牌弃置` };
    }

    const sorted = [...handIndices].sort((a, b) => b - a);
    const discarded: string[] = [];
    for (const idx of sorted) {
      if (idx < 0 || idx >= cur.handCards.length) {
        return { ok: false, error: '选手牌无效' };
      }
      const entry = cur.handCards[idx]!;
      cur.handCards.splice(idx, 1);
      this.host.getDeck().discardCard(entry);
      discarded.push(entry);
    }

    this.host.log(
      `${cur.generalName} 弃牌阶段：弃置 ${discarded.join('、')}（手牌 ${cur.handCards.length}/${handLimit}）`,
    );
    this.host.log(`${cur.generalName} 结束出牌阶段`);
    this.host.setPrompt(null);
    this.finishTurnAfterDiscard();
    return { ok: true };
  }

  cancelDiscard(playerId: string, promptId: string): { ok: boolean; error?: string } {
    const state = this.host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'discard_cards') {
      return { ok: false, error: '当前不是弃牌阶段' };
    }
    if (prompt.playerId !== playerId) {
      return { ok: false, error: '不是你的弃牌阶段' };
    }

    const cur = this.currentPlayer();
    if (!cur || cur.id !== playerId) return { ok: false, error: '状态错误' };

    this.host.setPrompt(null);
    this.advanceToPlay();
    return { ok: true };
  }

  private getHandLimit(player: EnginePlayerState): number {
    if (playerHasSkill(player, 'yingzi')) return player.maxHp;
    return Math.max(0, player.hp);
  }

  private finishTurnAfterDiscard(): void {
    const s = this.host.getState();
    const cur = this.currentPlayer();
    if (cur) {
      cur.lastTurnEndHp = cur.hp;
      if (cur.skillUseCount['_luoyi_damage_plus']) delete cur.skillUseCount['_luoyi_damage_plus'];
    }
    this.advanceToNextAlivePlayer();
    this.host.getFsm().set('judge');
    s.turn.phase = 'judge';
    this.host.setPrompt(null);
    this.beginTurn();
  }

  private advanceToNextAlivePlayer(): void {
    const state = this.host.getState();
    const playerCount = state.players.length;
    if (playerCount === 0) return;

    let nextIndex = state.turn.index;
    for (let offset = 0; offset < playerCount; offset++) {
      nextIndex = (nextIndex + 1) % playerCount;
      if (nextIndex === 0) state.turn.round += 1;
      if (state.players[nextIndex]?.hp > 0) {
        state.turn.index = nextIndex;
        return;
      }
    }

    state.turn.index = nextIndex;
  }

  private nextAlivePlayerAfter(player: EnginePlayerState): EnginePlayerState | undefined {
    const players = this.host.getState().players;
    if (players.length <= 1) return undefined;

    const sorted = [...players].sort((left, right) => left.seat - right.seat);
    const startIndex = sorted.findIndex((candidate) => candidate.id === player.id);
    if (startIndex < 0) return undefined;

    for (let offset = 1; offset < sorted.length; offset += 1) {
      const candidate = sorted[(startIndex + offset) % sorted.length]!;
      if (candidate.hp > 0 && !candidate.dead) return candidate;
    }
    return undefined;
  }

  dealOpeningHands(count = 4): void {
    for (const p of this.host.getState().players) {
      if (p.hp <= 0) continue;
      const need = Math.max(0, count - p.handCards.length);
      if (need > 0) {
        p.handCards.push(...this.host.getDeck().drawMany(need));
      }
    }
  }
}
