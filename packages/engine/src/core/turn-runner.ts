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
import {
  createCardInstance,
  formatCardInstance,
  type Suit,
  judgeDelayEffect,
} from '../engine/card-instance';
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
  syncState?(): void;
  afterPlayerGainedCards?(player: EnginePlayerState, gainedCards: string[]): void;
  afterPlayerLostHandCards?(player: EnginePlayerState, lostCount: number): void;
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
    const qinxueNextShaBonus = cur.skillUseCount._qinxue_next_sha_bonus ?? 0;
    cur.shaUsedCount = 0;
    cur.skillUseCount = {};
    cur.skillTargetUseCount = {};
    for (const player of this.host.getState().players) {
      delete player.skillUseCount._damage_dealt_this_turn;
      delete player.skillTargetUseCount._zhuhai_offered;
    }
    if (qinxueNextShaBonus > 0) {
      cur.skillUseCount._qinxue_sha_bonus = qinxueNextShaBonus;
    }
    this.host.getFsm().set('prepare');
    this.host.getState().turn.phase = 'prepare';
    this.host.setPrompt(null);
    this.host.log(`—— ${cur.generalName} 的回合开始`);
    this.processPreparePhase();
  }

  private processPreparePhase(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    const wangzunOffer = this.findNextWangzunOffer(cur);
    if (wangzunOffer) {
      cur.skillTargetUseCount._wangzun_offered = [
        ...(cur.skillTargetUseCount._wangzun_offered ?? []),
        wangzunOffer.id,
      ];
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: wangzunOffer.id,
        skillId: 'wangzun',
        skillName: '妄尊',
        characterSkills: characterSkillsForPrompt(wangzunOffer),
        message: `${cur.generalName} 的准备阶段：是否发动【妄尊】？`,
        options: [
          { id: 'skill:wangzun', label: '发动【妄尊】' },
          { id: 'skip', label: '不发动，继续准备阶段' },
        ],
      });
      return;
    }

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

  continuePreparePhase(): void {
    this.processPreparePhase();
  }

  submitWangzun(
    playerId: string,
    promptId: string,
    activate: boolean,
  ): { ok: boolean; error?: string } {
    const state = this.host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.id !== promptId) return { ok: false, error: '提示已失效' };
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'wangzun') {
      return { ok: false, error: '当前不是【妄尊】询问' };
    }
    if (prompt.playerId !== playerId) return { ok: false, error: '不是你发动【妄尊】' };

    const source = state.players.find((player) => player.id === playerId);
    const lord = this.currentPlayer();
    if (!source || !lord) return { ok: false, error: '角色不存在' };
    if (lord.role !== '主公' || source.id === lord.id || !playerHasSkill(source, 'wangzun')) {
      return { ok: false, error: '当前不满足【妄尊】发动条件' };
    }

    this.host.setPrompt(null);
    if (activate) {
      const drawn = this.host.getDeck().drawMany(1);
      source.handCards.push(...drawn);
      this.host.afterPlayerGainedCards?.(source, drawn);
      source.skillUseCount.wangzun = (source.skillUseCount.wangzun ?? 0) + 1;
      if (this.getHandLimit(lord) > 0) {
        lord.skillUseCount._wangzun_hand_limit_minus =
          (lord.skillUseCount._wangzun_hand_limit_minus ?? 0) + 1;
      }
      this.host.log(
        `${source.generalName} 发动【妄尊】，摸 ${drawn.length} 张牌，${lord.generalName} 本回合手牌上限 -1`,
      );
    }
    this.host.syncState?.();
    this.processPreparePhase();
    return { ok: true };
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
    const resultCardEntry = drawn ?? formatCardInstance(createCardInstance('杀'));
    const result = createCardInstance(resultCardEntry);
    this.host.log(describeJudgeResult(player, item.cardName, result));

    const modifyQueue = collectModifyJudgePlayers(
      player,
      this.host.getState().players,
    );
    this.host.setPendingJudge({
      targetPlayerId: player.id,
      judgeCardName: item.cardName,
      result,
      resultCardEntry,
      judgedSkillOwnerId: playerHasSkill(player, 'tiandu') ? player.id : undefined,
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
    this.host.getDeck().discardCard(pending.resultCardEntry);

    pending.result = replacement;
    pending.resultCardEntry = cardEntry;
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

    const lightningMoved =
      pending.judgeCardName === '闪电' &&
      !!judgeCardEntry &&
      !judgeDelayEffect(pending.judgeCardName, pending.result);

    if (pending.judgedSkillOwnerId && !lightningMoved) {
      const owner = this.host
        .getState()
        .players.find((p) => p.id === pending.judgedSkillOwnerId && p.hp > 0 && !p.dead);
      if (owner) {
        owner.handCards.push(pending.resultCardEntry);
        this.host.afterPlayerGainedCards?.(owner, [pending.resultCardEntry]);
        owner.skillUseCount.tiandu = (owner.skillUseCount.tiandu ?? 0) + 1;
        this.host.log(`${owner.generalName} 发动【天妒】，获得判定牌 ${pending.resultCardEntry}`);
      } else {
        this.host.getDeck().discardCard(pending.resultCardEntry);
      }
    } else {
      this.host.getDeck().discardCard(pending.resultCardEntry);
    }

    this.host.setPendingJudge(null);
    this.host.setPrompt(null);
    this.host.syncState?.();
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
    this.host.afterPlayerGainedCards?.(cur, drawn);
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
    const cur = this.currentPlayer();
    if (!cur) return;

    this.host.getState().turn.phase = 'end';
    this.host.getFsm().set('end');

    const zhuhaiOffer = this.findNextZhuhaiOffer(cur);
    if (zhuhaiOffer) {
      cur.skillTargetUseCount._zhuhai_offered = [
        ...(cur.skillTargetUseCount._zhuhai_offered ?? []),
        zhuhaiOffer.id,
      ];
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: zhuhaiOffer.id,
        skillId: 'zhuhai',
        skillName: '诛害',
        sourcePlayerId: cur.id,
        targetPlayerIds: [cur.id],
        characterSkills: characterSkillsForPrompt(zhuhaiOffer),
        message: `${cur.generalName} 的结束阶段：是否发动【诛害】对其使用一张【杀】？`,
        options: [
          { id: 'skill:zhuhai', label: '发动【诛害】' },
          { id: 'skip', label: '不发动，继续结束阶段' },
        ],
      });
      return;
    }

    const offers = collectOptionalSkillOffers(cur, GameTiming.PHASE_END).filter(
      (offer) => offer.skill.id === 'biyue',
    );
    if (offers.length > 0) {
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: cur.id,
        characterSkills: characterSkillsForPrompt(cur),
        message: '结束阶段：是否发动技能？',
        options: [
          ...offers.map((offer) => ({
            id: `skill:${offer.skill.id}`,
            label: `发动【${offer.skill.name}】`,
          })),
          { id: 'skip', label: '不发动，进入弃牌' },
        ],
      });
      return;
    }

    void this.enterDiscardPhase();
  }

  private findNextZhuhaiOffer(current: EnginePlayerState): EnginePlayerState | undefined {
    if ((current.skillUseCount._damage_dealt_this_turn ?? 0) <= 0) return undefined;
    const offered = new Set(current.skillTargetUseCount._zhuhai_offered ?? []);
    return this.host
      .getState()
      .players.filter(
        (player) =>
          player.id !== current.id &&
          player.hp > 0 &&
          !player.dead &&
          playerHasSkill(player, 'zhuhai') &&
          !offered.has(player.id) &&
          player.handCards.some((card) => cardNameFromHandEntry(card) === '杀'),
      )
      .sort((left, right) => left.seat - right.seat)[0];
  }

  endPlayPhase(playerId: string): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== playerId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }
    this.advanceToEnd();
    return { ok: true };
  }

  enterDiscardPhase(): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur) return { ok: false, error: '状态错误' };

    const discardOffers = collectOptionalSkillOffers(cur, GameTiming.PHASE_DISCARD).filter(
      (offer) => {
        if (offer.skill.id === 'keji') return cur.shaUsedCount === 0;
        if (offer.skill.id === 'qinxue') return cur.handCards.length > 0;
        return false;
      },
    );
    if (discardOffers.length > 0) {
      this.host.getState().turn.phase = 'discard';
      this.host.getFsm().set('discard');
      this.host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: cur.id,
        skillId: discardOffers.some((offer) => offer.skill.id === 'qinxue') ? 'qinxue' : undefined,
        skillName: discardOffers.some((offer) => offer.skill.id === 'qinxue') ? '勤学' : undefined,
        skillAction: discardOffers.some((offer) => offer.skill.id === 'qinxue')
          ? 'discard_draw'
          : undefined,
        discardCount: discardOffers.some((offer) => offer.skill.id === 'qinxue') ? 1 : undefined,
        discardHandIndices: discardOffers.some((offer) => offer.skill.id === 'qinxue')
          ? cur.handCards.map((_, index) => index)
          : undefined,
        characterSkills: characterSkillsForPrompt(cur),
        message: '弃牌阶段：是否发动技能？',
        options: [
          ...discardOffers.map((offer) => ({
            id: `skill:${offer.skill.id}`,
            label: `发动【${offer.skill.name}】`,
          })),
          { id: 'skip', label: '不发动，进入弃牌' },
        ],
      });
      return { ok: true };
    }

    return this.performDiscardCheck();
  }

  performDiscardCheck(): { ok: boolean; error?: string } {
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
    const handCountBefore = cur.handCards.length;
    for (const idx of sorted) {
      if (idx < 0 || idx >= cur.handCards.length) {
        return { ok: false, error: '选手牌无效' };
      }
      const entry = cur.handCards[idx]!;
      cur.handCards.splice(idx, 1);
      this.host.getDeck().discardCard(entry);
      discarded.push(entry);
    }
    this.host.afterPlayerLostHandCards?.(cur, handCountBefore - cur.handCards.length);

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
    const base = playerHasSkill(player, 'yingzi') ? player.maxHp : Math.max(0, player.hp);
    return Math.max(0, base - (player.skillUseCount._wangzun_hand_limit_minus ?? 0));
  }

  finishTurnAfterDiscard(): void {
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

  performQinxue(playerId: string, handIndex = 0): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== playerId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.host.getState().turn.phase !== 'discard') {
      return { ok: false, error: '当前不是弃牌阶段' };
    }
    if (!playerHasSkill(cur, 'qinxue')) {
      return { ok: false, error: '没有【勤学】技能' };
    }
    if ((cur.skillUseCount.qinxue ?? 0) > 0) {
      return { ok: false, error: '本回合已发动过【勤学】' };
    }
    if (cur.handCards.length === 0) {
      return { ok: false, error: '手牌为空，无法发动【勤学】' };
    }
    if (handIndex < 0 || handIndex >= cur.handCards.length) {
      return { ok: false, error: '所选手牌无效' };
    }

    const discarded = cur.handCards.splice(handIndex, 1)[0]!;
    this.host.getDeck().discardCard(discarded);
    this.host.afterPlayerLostHandCards?.(cur, 1);
    const drawn = this.host.getDeck().drawMany(2);
    cur.handCards.push(...drawn);
    this.host.afterPlayerGainedCards?.(cur, drawn);
    cur.skillUseCount.qinxue = (cur.skillUseCount.qinxue ?? 0) + 1;
    const suit = suitOf(discarded);
    if (suit) {
      const suits = new Set([...(cur.skillTargetUseCount._qinxue_suits ?? []), suit]);
      cur.skillTargetUseCount._qinxue_suits = [...suits];
      if (suits.size >= 2) {
        cur.skillUseCount._qinxue_sha_bonus = 1;
      }
    }
    this.host.log(
      `${cur.generalName} 发动【勤学】，弃置 ${discarded} 并摸 ${drawn.length} 张牌`,
    );
    this.host.setPrompt(null);
    this.host.syncState?.();
    return this.performDiscardCheck();
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

  private findNextWangzunOffer(lord: EnginePlayerState): EnginePlayerState | undefined {
    if (lord.role !== '主公') return undefined;
    const offered = new Set(lord.skillTargetUseCount._wangzun_offered ?? []);
    return this.host
      .getState()
      .players.find(
        (player) =>
          player.id !== lord.id &&
          player.hp > 0 &&
          !player.dead &&
          !offered.has(player.id) &&
          playerHasSkill(player, 'wangzun'),
      );
  }

  dealOpeningHands(count = 4): void {
    for (const p of this.host.getState().players) {
      if (p.hp <= 0) continue;
      const need = Math.max(0, count - p.handCards.length);
      if (need > 0) {
        const drawn = this.host.getDeck().drawMany(need);
        p.handCards.push(...drawn);
        this.host.afterPlayerGainedCards?.(p, drawn);
      }
    }
  }
}

function suitOf(entry: string): Suit | undefined {
  const suit = entry.trim()[0] as Suit | undefined;
  return suit === '♠' || suit === '♥' || suit === '♣' || suit === '♦' ? suit : undefined;
}
