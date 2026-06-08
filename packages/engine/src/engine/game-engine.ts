import { CharacterRegistry } from '../registry/character-registry';
import { CardRegistry } from '../registry/card-registry';
import type { CardDefinition } from '../types/card';
import type { EnginePlayerState, EngineSnapshot, GamePrompt } from '../types/game';
import type { TurnPhase } from '../types/timing';
import { GameTiming } from '../types/timing';
import {
  getOnFailEffects,
  getResponseTypeFromEffect,
  isAoeCard,
  removeCardFromHand,
  runCardEffects,
  shaBlockedByArmor,
  validResponseCards,
} from './effect-runner';
import { hasBaguaFormation } from './equipment-zone';
import { DeckPile } from './deck-pile';
import { getValidTargets, needsTargetSelection } from './targeting';
import {
  characterSkillsForPrompt,
  collectOptionalSkillOffers,
  playerHasSkill,
  runSkillEffects,
  type TimingContext,
} from './timing-runner';
import { EventManager } from './event-manager';
import { createCardInstance, formatCardInstance } from './card-instance';
import {
  applyJudgeEffect,
  collectModifyJudgePlayers,
  describeJudgeResult,
  type PendingJudge,
} from './judge-runner';

export interface RoomPlayerInput {
  id: string;
  nickname: string;
  general?: string;
  role?: string;
  hp?: number;
  maxHp?: number;
  handCards?: string[];
  equipment?: string[];
  judgeCards?: string[];
  seat?: number;
}

let promptSeq = 0;
function nextPromptId(): string {
  promptSeq += 1;
  return `prompt-${promptSeq}-${Date.now()}`;
}

export class GameEngine {
  private turnIndex = 0;
  private round = 1;
  private turnPhase: TurnPhase = 'judge';
  private log: string[] = [];
  private prompt: GamePrompt | null = null;
  private players: EnginePlayerState[] = [];
  private pendingCard: EngineSnapshot['pendingCard'];
  private pendingJudge: PendingJudge | null = null;
  private judgeQueue: { playerId: string; cardName: string }[] = [];
  private readonly deck = new DeckPile();
  private readonly events: EventManager;

  constructor(players: RoomPlayerInput[]) {
    this.players = players.map((p, i) => this.toEnginePlayer(p, i + 1));
    this.deck.reset();
    this.events = new EventManager({
      log: (m) => this.log.unshift(m),
      getPlayers: () => this.players,
      currentPlayer: () => this.currentPlayer(),
      getPrompt: () => this.prompt,
      setPrompt: (p) => {
        this.prompt = p;
      },
      nextPromptId,
      offerOptionalSkills: (timing) => this.offerOptionalSkills(timing),
    });
  }

  static findLordIndex(players: { role?: string }[]): number {
    const idx = players.findIndex((p) => p.role === '主公');
    return idx >= 0 ? idx : 0;
  }

  getSnapshot(): EngineSnapshot {
    return {
      turnIndex: this.turnIndex,
      round: this.round,
      turnPhase: this.turnPhase,
      log: [...this.log],
      prompt: this.prompt,
      players: this.players.map((p) => ({ ...p, handCards: [...p.handCards] })),
      pendingCard: this.pendingCard,
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

  /** 开局：定位主公并开始其回合 */
  start(): void {
    this.deck.reset();
    this.turnIndex = GameEngine.findLordIndex(
      this.players.map((p) => ({ role: p.role })),
    );
    const lord = this.players[this.turnIndex];
    this.log.unshift(`【开局】从主公 ${lord?.generalName ?? lord?.nickname} 开始`);
    this.beginTurn();
  }

  beginTurn(): void {
    const cur = this.currentPlayer();
    if (!cur) return;
    cur.shaUsedCount = 0;
    cur.skillUseCount = {};
    this.turnPhase = 'judge';
    this.prompt = null;
    this.log.unshift(`—— ${cur.generalName} 的回合开始`);
    this.events.emit(GameTiming.TURN_START, { source: cur });
    this.processJudgePhase();
  }

  private processJudgePhase(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    this.judgeQueue = cur.judgeCards.map((name) => ({
      playerId: cur.id,
      cardName: name,
    }));

    if (this.judgeQueue.length === 0) {
      this.advanceToBeforeDraw();
      return;
    }

    this.turnPhase = 'judge';
    this.resolveNextJudge();
  }

  private resolveNextJudge(): void {
    const item = this.judgeQueue.shift();
    if (!item) {
      this.advanceToBeforeDraw();
      return;
    }
    const player = this.players.find((p) => p.id === item.playerId);
    if (!player) {
      this.resolveNextJudge();
      return;
    }

    const drawn = this.deck.drawOne();
    const result = createCardInstance(drawn ?? '杀');
    this.log.unshift(describeJudgeResult(player, item.cardName, result));

    this.events.emit(GameTiming.BEFORE_JUDGE, { source: player });
    this.events.emit(GameTiming.JUDGE, { source: player });

    const modifyQueue = collectModifyJudgePlayers(player, this.players);
    this.pendingJudge = {
      targetPlayerId: player.id,
      judgeCardName: item.cardName,
      result,
      modifyQueue,
      modifyIndex: 0,
      modified: false,
    };

    if (modifyQueue.length > 0) {
      this.offerModifyJudge();
      return;
    }

    this.finishJudgeResolution();
  }

  /** 判定牌翻出后、生效前：询问改判 */
  private offerModifyJudge(): void {
    const pending = this.pendingJudge;
    if (!pending) return;

    while (pending.modifyIndex < pending.modifyQueue.length) {
      const modifierId = pending.modifyQueue[pending.modifyIndex]!;
      const modifier = this.players.find((p) => p.id === modifierId);
      if (!modifier || modifier.hp <= 0 || modifier.handCards.length === 0) {
        pending.modifyIndex += 1;
        continue;
      }

      const target = this.players.find((p) => p.id === pending.targetPlayerId);
      const modSkill = CharacterRegistry.resolve(modifier.generalName)?.skills.find((s) =>
        s.effects?.some((e) => e.action === 'modifyJudge'),
      );
      const skillLabel = modSkill?.name ?? '改判';
      this.prompt = {
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
      };
      return;
    }

    this.finishJudgeResolution();
  }

  /** 改判：打出一张手牌代替判定结果 */
  submitModifyJudge(
    modifierId: string,
    promptId: string,
    handIndex: number,
  ): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (this.prompt.type !== 'modify_judge') {
      return { ok: false, error: '当前不是改判阶段' };
    }
    if (this.prompt.playerId !== modifierId) {
      return { ok: false, error: '不是你改判' };
    }
    const pending = this.pendingJudge;
    if (!pending) return { ok: false, error: '无待处理判定' };

    const modifier = this.players.find((p) => p.id === modifierId);
    if (!modifier) return { ok: false, error: '角色不存在' };
    if (handIndex < 0 || handIndex >= modifier.handCards.length) {
      return { ok: false, error: '选手牌无效' };
    }

    const cardName = modifier.handCards[handIndex]!;
    modifier.handCards.splice(handIndex, 1);
    const replacement = createCardInstance(cardName);
    this.deck.discardCard(cardName);

    pending.result = replacement;
    pending.modified = true;
    const modSkill = CharacterRegistry.resolve(modifier.generalName)?.skills.find((s) =>
      s.effects?.some((e) => e.action === 'modifyJudge'),
    );
    this.log.unshift(
      `${modifier.generalName} 发动【${modSkill?.name ?? '改判'}】，以 ${formatCardInstance(replacement)} 代替判定结果`,
    );
    this.prompt = null;
    this.finishJudgeResolution();
    return { ok: true };
  }

  skipModifyJudge(modifierId: string, promptId: string): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (this.prompt.type !== 'modify_judge') {
      return { ok: false, error: '当前不是改判阶段' };
    }
    if (this.prompt.playerId !== modifierId) {
      return { ok: false, error: '不是你改判' };
    }
    const pending = this.pendingJudge;
    if (!pending) return { ok: false, error: '无待处理判定' };

    pending.modifyIndex += 1;
    this.prompt = null;
    this.offerModifyJudge();
    return { ok: true };
  }

  private finishJudgeResolution(): void {
    const pending = this.pendingJudge;
    if (!pending) return;

    const player = this.players.find((p) => p.id === pending.targetPlayerId);
    if (!player) {
      this.pendingJudge = null;
      this.resolveNextJudge();
      return;
    }

    const idx = player.judgeCards.indexOf(pending.judgeCardName);
    if (idx >= 0) player.judgeCards.splice(idx, 1);

    const effect = applyJudgeEffect(player, pending.judgeCardName, pending.result);
    if (effect.skipPlay) {
      player.skillUseCount['_skip_play'] = 1;
      this.log.unshift(`【${pending.judgeCardName}】生效，${player.generalName} 跳过出牌阶段`);
    }
    if (effect.skipDraw) {
      player.skillUseCount['_skip_draw'] = 1;
      this.log.unshift(`【${pending.judgeCardName}】生效，${player.generalName} 跳过摸牌阶段`);
    }
    if (effect.lightningDamage) {
      this.log.unshift(`【闪电】生效`);
      this.applyDamage(player, player, effect.lightningDamage);
    }

    this.events.emit(GameTiming.AFTER_JUDGE, { source: player });
    this.pendingJudge = null;
    this.prompt = null;
    this.resolveNextJudge();
  }

  private advanceToBeforeDraw(): void {
    this.turnPhase = 'before_draw';
    this.offerOptionalSkills(GameTiming.BEFORE_DRAW);
  }

  private offerOptionalSkills(timing: GameTiming): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    const offers = collectOptionalSkillOffers(cur, timing);
    if (offers.length > 0) {
      this.prompt = {
        id: nextPromptId(),
        type: 'use_skill',
        playerId: cur.id,
        characterSkills: characterSkillsForPrompt(cur),
        message:
          timing === GameTiming.BEFORE_DRAW
            ? '摸牌前：是否发动技能？'
            : '出牌阶段：是否发动技能？',
        options: [
          ...offers.map((o) => ({
            id: `skill:${o.skill.id}`,
            label: `发动【${o.skill.name}】`,
          })),
          {
            id: 'skip',
            label:
              timing === GameTiming.BEFORE_DRAW ? '不发动，进入摸牌' : '不发动，继续出牌',
          },
        ],
      };
      return;
    }

    if (timing === GameTiming.BEFORE_DRAW) {
      this.advanceToDraw();
    } else if (timing === GameTiming.PHASE_PLAY) {
      this.turnPhase = 'play';
      this.log.unshift(`—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
    }
  }

  advanceToDraw(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    if (cur.skillUseCount['_skip_draw']) {
      delete cur.skillUseCount['_skip_draw'];
      this.log.unshift(`${cur.generalName} 跳过摸牌阶段`);
      this.advanceToPlay();
      return;
    }

    this.turnPhase = 'draw';
    const drawCount = 2 + (playerHasSkill(cur, 'yingzi') ? 1 : 0);
    const drawn = this.deck.drawMany(drawCount);
    cur.handCards.push(...drawn);
    this.log.unshift(
      `${cur.generalName} 摸牌阶段：摸 ${drawn.length} 张（牌堆余 ${this.deck.remaining()}，手牌 ${cur.handCards.length} 张）`,
    );
    this.events.emit(GameTiming.CARD_DRAWN, { source: cur });
    this.advanceToPlay();
  }

  advanceToPlay(): void {
    const cur = this.currentPlayer();
    if (!cur) return;

    if (cur.skillUseCount['_skip_play']) {
      delete cur.skillUseCount['_skip_play'];
      this.log.unshift(`${cur.generalName} 跳过出牌阶段`);
      this.advanceToEnd();
      return;
    }

    this.turnPhase = 'play';
    this.events.emit(GameTiming.PHASE_PLAY, { source: cur });
    if (this.prompt) return;

    this.prompt = null;
    this.log.unshift(`—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
  }

  /** 请求使用手牌 */
  initiatePlayCard(
    sourceId: string,
    cardName: string,
    handIndex?: number,
  ): { ok: boolean; error?: string } {
    if (this.prompt) {
      return { ok: false, error: '请先处理当前提示' };
    }
    const cur = this.currentPlayer();
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.turnPhase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }

    const card = CardRegistry.getByName(cardName);
    if (!card) return { ok: false, error: `未知卡牌：${cardName}` };
    if (card.canInitiate === false) {
      return { ok: false, error: '此牌不能主动打出' };
    }
    const idx =
      handIndex != null && handIndex >= 0 && handIndex < cur.handCards.length
        ? handIndex
        : cur.handCards.indexOf(cardName);
    if (idx < 0 || cur.handCards[idx] !== cardName) {
      return { ok: false, error: '手牌中没有此牌' };
    }
    if (card.id === 'sha' && cur.shaUsedCount >= (card.defaultUsePerTurn ?? 1)) {
      const hasCrossbow = cur.equipment.some((e) => e.includes('诸葛连弩'));
      const hasPaoxiao = playerHasSkill(cur, 'paoxiao');
      if (!hasCrossbow && !hasPaoxiao) {
        return { ok: false, error: '本回合【杀】已用完' };
      }
    }

    this.pendingCard = { cardId: card.id, sourceId, targetIds: [], handIndex: idx };

    this.prompt = {
      id: nextPromptId(),
      type: 'play_card_confirm',
      playerId: sourceId,
      cardId: card.id,
      cardName: card.name,
      characterSkills: characterSkillsForPrompt(cur),
      message: `确认使用【${card.name}】？`,
      options: [
        { id: 'confirm', label: '确认打出' },
        { id: 'cancel', label: '取消' },
      ],
    };
    return { ok: true };
  }

  /** 确认打出后进入选目标或结算 */
  confirmPlayCard(sourceId: string, promptId: string): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    const card = CardRegistry.getById(this.pendingCard?.cardId ?? '');
    if (!card) return { ok: false, error: '卡牌无效' };

    if (needsTargetSelection(card)) {
      const source = this.players.find((p) => p.id === sourceId);
      if (!source) return { ok: false, error: '玩家不存在' };
      const valid = getValidTargets(card, source, this.players);
      if (valid.length === 0) {
        this.clearPending();
        this.prompt = null;
        return { ok: false, error: '没有合法的目标角色' };
      }
      const max = card.targeting.count?.max ?? 1;
      this.prompt = {
        id: nextPromptId(),
        type: 'select_targets',
        playerId: sourceId,
        cardId: card.id,
        cardName: card.name,
        message: `请选择【${card.name}】的目标（${card.targeting.count?.min ?? 1}～${max} 名）`,
        validTargetIds: valid.map((t) => t.id),
      };
      return { ok: true };
    }

    return this.resolveCard(sourceId, []);
  }

  selectTargets(
    sourceId: string,
    promptId: string,
    targetIds: string[],
  ): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (this.prompt.type !== 'select_targets') {
      return { ok: false, error: '当前不是选目标阶段' };
    }
    const valid = new Set(this.prompt.validTargetIds ?? []);
    for (const id of targetIds) {
      if (!valid.has(id)) return { ok: false, error: '目标不合法' };
    }
    const card = CardRegistry.getById(this.pendingCard?.cardId ?? '');
    const min = card?.targeting.count?.min ?? 1;
    const max = card?.targeting.count?.max ?? 1;
    if (targetIds.length < min || targetIds.length > max) {
      return { ok: false, error: `请选择 ${min}${max > min ? `～${max}` : ''} 个目标` };
    }
    return this.resolveCard(sourceId, targetIds);
  }

  private resolveCard(
    sourceId: string,
    targetIds: string[],
  ): { ok: boolean; error?: string } {
    const card = CardRegistry.getById(this.pendingCard?.cardId ?? '');
    const source = this.players.find((p) => p.id === sourceId);
    if (!card || !source) {
      this.clearPending();
      return { ok: false, error: '结算失败' };
    }

    removeCardFromHand(source, card.name, this.pendingCard?.handIndex);
    if (card.type !== 'equipment') {
      this.deck.discardCard(card.name);
    }
    if (card.id === 'sha') source.shaUsedCount += 1;

    let targets = targetIds
      .map((id) => this.players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);

    if (targets.length === 0 && card.targeting.selector === 'self') {
      targets = [source];
    }
    if (
      targets.length === 0 &&
      (card.targeting.selector === 'allOthers' || card.targeting.selector === 'all')
    ) {
      targets = getValidTargets(card, source, this.players);
    }

    this.log.unshift(
      `${source.generalName} 对 ${targets.map((t) => t.generalName).join('、') || '全场'} 使用【${card.name}】`,
    );
    this.events.emit(GameTiming.CARD_USED, { source, targets, card });

    const responseType = getResponseTypeFromEffect(card);
    if (responseType && isAoeCard(card) && targets.length > 0) {
      const queue = this.sortAoeTargets(source, targets).map((t) => t.id);
      this.pendingCard = {
        cardId: card.id,
        sourceId,
        targetIds: queue,
        responseType,
        aoeQueue: [...queue],
        responseCount: 0,
        responsesRequired: 1,
      };
      const timingCtx: TimingContext = { source, card, responsesRequired: 1 };
      this.events.applyLockedModifiers(timingCtx);
      this.pendingCard.responsesRequired = timingCtx.responsesRequired ?? 1;
      return this.promptNextResponse();
    }

    if (responseType && targets.length > 0) {
      const target = targets[0]!;
      if (card.id === 'sha' && shaBlockedByArmor(source, target)) {
        this.log.unshift(`【仁王盾】生效，【杀】对 ${target.generalName} 无效`);
        this.clearPending();
        this.prompt = null;
        return { ok: true };
      }
      const timingCtx: TimingContext = { source, targets, card, responsesRequired: 1 };
      this.events.applyLockedModifiers(timingCtx);
      this.pendingCard = {
        cardId: card.id,
        sourceId,
        targetIds: targetIds.length ? targetIds : [target.id],
        awaitingResponseFrom: target.id,
        responseType,
        responseCount: 0,
        responsesRequired: timingCtx.responsesRequired ?? 1,
      };
      return this.promptNextResponse();
    }

    if (card.type === 'equipment') {
      this.events.emit(GameTiming.EQUIP, { source, card });
    }

    runCardEffects({
      source,
      targets,
      card,
      deck: this.deck,
      log: (m) => this.log.unshift(m),
    });
    this.clearPending();
    this.prompt = null;
    return { ok: true };
  }

  /** AOE / 单体：按 pending 状态弹出响应提示 */
  private promptNextResponse(): { ok: boolean; error?: string } {
    const pending = this.pendingCard;
    const card = CardRegistry.getById(pending?.cardId ?? '');
    const source = this.players.find((p) => p.id === pending?.sourceId);
    if (!pending || !card || !source) {
      this.clearPending();
      this.prompt = null;
      return { ok: false, error: '响应状态错误' };
    }

    const responseType = pending.responseType ?? getResponseTypeFromEffect(card);
    if (!responseType) {
      this.finishResponseChain();
      return { ok: true };
    }

    let targetId = pending.awaitingResponseFrom;
    if (pending.aoeQueue?.length) {
      targetId = pending.aoeQueue[0];
      pending.awaitingResponseFrom = targetId;
    }

    if (!targetId) {
      this.finishResponseChain();
      return { ok: true };
    }

    const target = this.players.find((p) => p.id === targetId);
    if (!target || target.hp <= 0) {
      if (pending.aoeQueue?.length) {
        pending.aoeQueue.shift();
        pending.responseCount = 0;
        return this.promptNextResponse();
      }
      this.finishResponseChain();
      return { ok: true };
    }

    if (card.id === 'sha' && shaBlockedByArmor(source, target)) {
      this.log.unshift(`【仁王盾】生效，【杀】对 ${target.generalName} 无效`);
      if (pending.aoeQueue?.length) {
        pending.aoeQueue.shift();
        pending.responseCount = 0;
        return this.promptNextResponse();
      }
      this.clearPending();
      this.prompt = null;
      return { ok: true };
    }

    const validCards = validResponseCards(responseType, target.handCards);
    const label = responseType === 'shan' ? '闪' : '杀';
    const required = pending.responsesRequired ?? 1;
    const count = pending.responseCount ?? 0;
    const wushuangHint =
      required > 1 ? `（需打出 ${required} 张【${label}】，已 ${count}/${required}）` : '';

    this.prompt = {
      id: nextPromptId(),
      type: 'response',
      playerId: target.id,
      sourcePlayerId: source.id,
      cardName: card.name,
      message: `${target.generalName}：请打出【${label}】响应【${card.name}】${wushuangHint}`,
      validResponseCards: validCards,
      targetPlayerIds: pending.targetIds,
      options: [
        ...validCards.map((c) => ({ id: `card:${c}`, label: `打出【${c}】` })),
        { id: 'pass', label: '不出（承受效果）' },
        ...(hasBaguaFormation(target) && responseType === 'shan'
          ? [{ id: 'bagua', label: '发动【八卦阵】判定' }]
          : []),
      ],
    };
    return { ok: true };
  }

  private sortAoeTargets(
    source: EnginePlayerState,
    targets: EnginePlayerState[],
  ): EnginePlayerState[] {
    const ordered = [...this.players].sort((a, b) => a.seat - b.seat);
    const startIdx = ordered.findIndex((p) => p.id === source.id);
    const result: EnginePlayerState[] = [];
    for (let i = 1; i <= ordered.length; i++) {
      const p = ordered[(startIdx + i) % ordered.length]!;
      const t = targets.find((x) => x.id === p.id);
      if (t && t.hp > 0) result.push(t);
    }
    return result;
  }

  private finishResponseChain(): void {
    this.clearPending();
    this.prompt = null;
    this.log.unshift('锦囊/AOE 响应结算完毕');
  }

  submitResponse(
    responderId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (this.prompt.type !== 'response') {
      return { ok: false, error: '当前不是响应阶段' };
    }
    if (this.prompt.playerId !== responderId) {
      return { ok: false, error: '不是你响应' };
    }

    const card = CardRegistry.getById(this.pendingCard?.cardId ?? '');
    const source = this.players.find((p) => p.id === this.pendingCard?.sourceId);
    const target = this.players.find((p) => p.id === responderId);
    if (!card || !source || !target || !this.pendingCard) {
      this.clearPending();
      this.prompt = null;
      return { ok: false, error: '状态错误' };
    }

    const required = this.pendingCard.responsesRequired ?? 1;

    if (choiceId === 'bagua') {
      const suits = ['♠', '♥', '♣', '♦'];
      const suit = suits[Math.floor(Math.random() * 4)]!;
      const isRed = suit === '♥' || suit === '♦';
      this.log.unshift(
        `${target.generalName} 【八卦阵】判定：${suit} → ${isRed ? '视为【闪】' : '无效'}`,
      );
      if (isRed) {
        this.pendingCard.responseCount = (this.pendingCard.responseCount ?? 0) + 1;
        if (this.pendingCard.responseCount >= required) {
          return this.advanceAfterSuccessfulResponse(target);
        }
        return this.promptNextResponse();
      }
      return { ok: true };
    }

    if (choiceId.startsWith('card:')) {
      const cardName = choiceId.slice(5);
      if (!removeCardFromHand(target, cardName)) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      this.deck.discardCard(cardName);
      this.pendingCard.responseCount = (this.pendingCard.responseCount ?? 0) + 1;
      this.log.unshift(
        `${target.generalName} 打出【${cardName}】（${this.pendingCard.responseCount}/${required}）`,
      );
      if (this.pendingCard.responseCount < required) {
        return this.promptNextResponse();
      }
      return this.advanceAfterSuccessfulResponse(target);
    }

    if (choiceId === 'pass') {
      this.log.unshift(`${target.generalName} 未响应【${card.name}】`);
      const onFail = getOnFailEffects(card);
      if (onFail.length > 0) {
        for (const effect of onFail) {
          if (effect.action === 'damage') {
            const amount = (effect.params?.amount as number) ?? 1;
            this.applyDamage(source, target, amount, card);
          }
        }
      } else {
        runCardEffects({
          source,
          targets: [target],
          card,
          deck: this.deck,
          log: (m) => this.log.unshift(m),
        });
      }
      return this.advanceAfterFailedResponse(target);
    }

    return { ok: false, error: '无效选择' };
  }

  /** 响应成功：单体结束；AOE 进入下一名 */
  private advanceAfterSuccessfulResponse(
    _target: EnginePlayerState,
  ): { ok: boolean; error?: string } {
    const pending = this.pendingCard;
    if (pending?.aoeQueue?.length) {
      pending.aoeQueue.shift();
      pending.responseCount = 0;
      if (pending.aoeQueue.length === 0) {
        this.finishResponseChain();
        return { ok: true };
      }
      return this.promptNextResponse();
    }
    this.clearPending();
    this.prompt = null;
    return { ok: true };
  }

  /** 未响应承受伤害后：AOE 下一名或结束 */
  private advanceAfterFailedResponse(
    _target: EnginePlayerState,
  ): { ok: boolean; error?: string } {
    const pending = this.pendingCard;
    if (pending?.aoeQueue?.length) {
      pending.aoeQueue.shift();
      pending.responseCount = 0;
      if (pending.aoeQueue.length === 0) {
        this.finishResponseChain();
        return { ok: true };
      }
      return this.promptNextResponse();
    }
    if (this.prompt?.type === 'use_skill') {
      return { ok: true };
    }
    this.clearPending();
    this.prompt = null;
    return { ok: true };
  }

  private applyDamage(
    source: EnginePlayerState,
    target: EnginePlayerState,
    amount: number,
    card?: CardDefinition,
  ): void {
    const ctx: TimingContext = { source, targets: [target], card, damageAmount: amount };
    this.events.emit(GameTiming.BEFORE_DAMAGE, ctx);
    target.hp = Math.max(0, target.hp - amount);
    this.log.unshift(
      `${target.generalName} 受到 ${amount} 点伤害（${target.hp}/${target.maxHp}）`,
    );
    this.events.emit(GameTiming.DAMAGE, ctx);
    this.events.emit(GameTiming.AFTER_DAMAGE, { source, targets: [target], card });
  }

  submitPromptChoice(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }

    if (this.prompt.type === 'play_card_confirm') {
      if (choiceId === 'cancel') {
        this.clearPending();
        this.prompt = null;
        return { ok: true };
      }
      if (choiceId === 'confirm') {
        return this.confirmPlayCard(playerId, promptId);
      }
    }

    if (this.prompt.type === 'use_skill') {
      if (choiceId === 'rende:finish') {
        return this.rendeFinish(playerId);
      }
      if (choiceId === 'cancel' && (this.prompt.skillId === 'rende' || this.prompt.skillId === 'zhiheng')) {
        this.prompt = null;
        if (this.turnPhase === 'play') {
          this.log.unshift(`—— ${this.currentPlayer()?.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
        }
        return { ok: true };
      }
      if (choiceId === 'skip') {
        this.prompt = null;
        if (this.turnPhase === 'before_draw') this.advanceToDraw();
        else if (this.turnPhase === 'play') {
          this.log.unshift(`—— ${this.currentPlayer()?.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
        } else if (this.pendingCard?.aoeQueue?.length) {
          return this.promptNextResponse();
        }
        return { ok: true };
      }
      if (choiceId.startsWith('skill:')) {
        const skillId = choiceId.slice(6);
        const res = this.initiateSkill(playerId, skillId);
        if (res.ok && this.pendingCard?.aoeQueue?.length && !this.prompt) {
          return this.promptNextResponse();
        }
        return res;
      }
    }

    return { ok: false, error: '无效选择' };
  }

  initiateSkill(sourceId: string, skillId: string): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    const ch = CharacterRegistry.resolve(cur.generalName);
    const skill = ch?.skills.find((s) => s.id === skillId);
    if (!skill) return { ok: false, error: '技能不存在' };

    if (skillId === 'rende') {
      if (this.turnPhase !== 'play') {
        return { ok: false, error: '当前不是出牌阶段' };
      }
      this.prompt = {
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(cur),
        message: '【仁德】：选择一名其他角色，勾选多张手牌后点击「给予手牌」，可多次给予直至点击「完成仁德」',
        validTargetIds: this.players
          .filter((p) => p.id !== sourceId && p.hp > 0)
          .map((p) => p.id),
        options: [
          { id: 'rende:finish', label: '完成仁德' },
          { id: 'cancel', label: '取消' },
        ],
      };
      return { ok: true };
    }

    if (skillId === 'zhiheng') {
      if (this.turnPhase !== 'play') {
        return { ok: false, error: '当前不是出牌阶段' };
      }
      if (cur.handCards.length === 0) {
        return { ok: false, error: '手牌为空，无法制衡' };
      }
      this.prompt = {
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(cur),
        message: '【制衡】：勾选要弃置的手牌（至少一张），弃置后摸等量的牌',
        options: [
          { id: 'zhiheng:confirm', label: '确认制衡' },
          { id: 'cancel', label: '取消' },
        ],
      };
      return { ok: true };
    }

    if (skillId === 'jianxiong') {
      cur.skillUseCount[skillId] = (cur.skillUseCount[skillId] ?? 0) + 1;
      runSkillEffects(cur, skill, (m) => this.log.unshift(m), this.deck);
      this.prompt = null;
      return { ok: true };
    }

    cur.skillUseCount[skillId] = (cur.skillUseCount[skillId] ?? 0) + 1;
    this.log.unshift(`${cur.generalName} 发动【${skill.name}】`);
    this.prompt = null;
    if (this.turnPhase === 'before_draw') this.advanceToDraw();
    else if (this.turnPhase === 'play' && !this.pendingCard) {
      this.log.unshift(`—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
    }
    return { ok: true };
  }

  /** 制衡：弃置选手牌并摸等量牌 */
  zhihengConfirm(
    sourceId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.prompt?.skillId !== 'zhiheng') {
      return { ok: false, error: '当前未在制衡流程中' };
    }
    if (handIndices.length === 0) {
      return { ok: false, error: '请至少选择一张手牌' };
    }

    const sorted = [...handIndices].sort((a, b) => b - a);
    const unique = new Set(sorted);
    if (unique.size !== handIndices.length) {
      return { ok: false, error: '不能重复选择同一张牌' };
    }

    const discarded: string[] = [];
    for (const idx of sorted) {
      if (idx < 0 || idx >= cur.handCards.length) {
        return { ok: false, error: '选手牌无效' };
      }
      const name = cur.handCards[idx]!;
      cur.handCards.splice(idx, 1);
      this.deck.discardCard(name);
      discarded.push(name);
    }

    const count = discarded.length;
    const drawn = this.deck.drawMany(count);
    cur.handCards.push(...drawn);

    cur.skillUseCount.zhiheng = (cur.skillUseCount.zhiheng ?? 0) + 1;
    this.log.unshift(
      `${cur.generalName} 发动【制衡】，弃置 ${discarded.map((c) => `【${c}】`).join('')}，摸 ${drawn.length} 张（手牌 ${cur.handCards.length} 张）`,
    );
    this.prompt = null;
    this.log.unshift(`—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`);
    return { ok: true };
  }

  /** 仁德：选目标并给出多张手牌（保持仁德弹窗） */
  rendeGive(
    sourceId: string,
    targetId: string,
    cardNames: string[],
    handIndices?: number[],
  ): { ok: boolean; error?: string } {
    const source = this.players.find((p) => p.id === sourceId);
    const target = this.players.find((p) => p.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (targetId === sourceId) return { ok: false, error: '仁德目标须为其他角色' };
    if (!cardNames.length) return { ok: false, error: '请选择至少一张手牌' };

    const given: string[] = [];
    const usedIndices = new Set<number>();
    for (let i = 0; i < cardNames.length; i++) {
      const name = cardNames[i]!;
      let idx =
        handIndices?.[i] != null && handIndices[i]! >= 0
          ? handIndices[i]!
          : source.handCards.indexOf(name);
      if (usedIndices.has(idx) || source.handCards[idx] !== name) {
        idx = source.handCards.findIndex((c, j) => c === name && !usedIndices.has(j));
      }
      if (idx < 0 || source.handCards[idx] !== name) {
        return { ok: false, error: `手牌中没有【${name}】` };
      }
      usedIndices.add(idx);
      source.handCards.splice(idx, 1);
      target.handCards.push(name);
      given.push(name);
    }

    this.log.unshift(
      `${source.generalName} 发动【仁德】，将 ${given.map((c) => `【${c}】`).join('')} 交给 ${target.generalName}`,
    );

    if (this.prompt?.skillId === 'rende') {
      this.prompt = {
        ...this.prompt,
        id: nextPromptId(),
        message: `【仁德】已给予 ${target.generalName} ${given.length} 张牌，可继续选牌给予或点击「完成仁德」`,
      };
    }
    return { ok: true };
  }

  rendeFinish(sourceId: string): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.prompt?.skillId !== 'rende') {
      return { ok: false, error: '当前未在仁德流程中' };
    }
    cur.skillUseCount.rende = (cur.skillUseCount.rende ?? 0) + 1;
    this.log.unshift(`${cur.generalName} 结束【仁德】`);
    this.prompt = null;
    return { ok: true };
  }

  endTurn(playerId: string): { ok: boolean; error?: string } {
    if (this.prompt) {
      return {
        ok: false,
        error:
          this.prompt.type === 'discard_cards'
            ? '请先完成弃牌'
            : '请先处理当前提示',
      };
    }
    const cur = this.currentPlayer();
    if (!cur || cur.id !== playerId) {
      return { ok: false, error: '不是你的回合' };
    }
    this.log.unshift(`${cur.generalName} 结束出牌阶段`);
    return this.enterDiscardPhase();
  }

  submitDiscard(
    playerId: string,
    promptId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    if (!this.prompt || this.prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }
    if (this.prompt.type !== 'discard_cards') {
      return { ok: false, error: '当前不是弃牌阶段' };
    }
    if (this.prompt.playerId !== playerId) {
      return { ok: false, error: '不是你弃牌' };
    }

    const cur = this.currentPlayer();
    if (!cur) return { ok: false, error: '状态错误' };

    const need = this.prompt.discardCount ?? 0;
    if (handIndices.length !== need) {
      return { ok: false, error: `请选择 ${need} 张牌弃置` };
    }

    const sorted = [...handIndices].sort((a, b) => b - a);
    const discarded: string[] = [];
    for (const idx of sorted) {
      if (idx < 0 || idx >= cur.handCards.length) {
        return { ok: false, error: '选手牌无效' };
      }
      const name = cur.handCards[idx]!;
      cur.handCards.splice(idx, 1);
      this.deck.discardCard(name);
      discarded.push(name);
    }

    this.log.unshift(
      `${cur.generalName} 弃牌阶段：弃置 ${discarded.map((c) => `【${c}】`).join('')}（手牌 ${cur.handCards.length}/${cur.hp}）`,
    );
    this.prompt = null;
    this.finishTurnAfterDiscard();
    return { ok: true };
  }

  private enterDiscardPhase(): { ok: boolean; error?: string } {
    const cur = this.currentPlayer();
    if (!cur) return { ok: false, error: '状态错误' };

    const limit = this.getHandLimit(cur);
    const excess = cur.handCards.length - limit;
    if (excess <= 0) {
      this.finishTurnAfterDiscard();
      return { ok: true };
    }

    this.turnPhase = 'discard';
    this.prompt = {
      id: nextPromptId(),
      type: 'discard_cards',
      playerId: cur.id,
      message: `弃牌阶段：手牌 ${cur.handCards.length} 张，当前体力 ${limit}，请弃置 ${excess} 张牌`,
      discardCount: excess,
      discardHandIndices: cur.handCards.map((_, i) => i),
      options: [{ id: 'confirm_discard', label: '确认弃牌' }],
    };
    return { ok: true };
  }

  /** 手牌上限：默认当前体力；【英姿】为体力上限 */
  private getHandLimit(player: EnginePlayerState): number {
    if (playerHasSkill(player, 'yingzi')) {
      return player.maxHp;
    }
    return Math.max(0, player.hp);
  }

  private finishTurnAfterDiscard(): void {
    const cur = this.currentPlayer();
    if (cur) {
      this.events.emit(GameTiming.PHASE_END, { source: cur });
      this.events.emit(GameTiming.TURN_END, { source: cur });
    }
    this.advanceTurn();
  }

  private advanceTurn(): void {
    const prev = this.turnIndex;
    this.turnIndex = (prev + 1) % this.players.length;
    if (this.turnIndex === 0) this.round += 1;
    this.turnPhase = 'judge';
    this.prompt = null;
    this.clearPending();
    this.beginTurn();
  }

  private advanceToEnd(): void {
    this.log.unshift(`${this.currentPlayer()?.generalName ?? '角色'} 跳过出牌阶段`);
    void this.enterDiscardPhase();
  }

  currentPlayer(): EnginePlayerState | undefined {
    return this.players[this.turnIndex];
  }

  private clearPending(): void {
    this.pendingCard = undefined;
  }

  private toEnginePlayer(p: RoomPlayerInput, seat: number): EnginePlayerState {
    const ch = CharacterRegistry.resolve(p.general ?? p.nickname);
    const isLord = p.role === '主公';
    const maxHp = (p.maxHp ?? ch?.maxHp ?? 4) + (isLord ? 1 : 0);
    return {
      id: p.id,
      seat: p.seat ?? seat,
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
  }

  applyToRoomPlayers(): RoomPlayerInput[] {
    return this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      general: p.generalName,
      role: p.role,
      hp: p.hp,
      maxHp: p.maxHp,
      handCards: p.handCards,
      equipment: p.equipment,
      judgeCards: p.judgeCards,
      seat: p.seat,
    }));
  }
}
