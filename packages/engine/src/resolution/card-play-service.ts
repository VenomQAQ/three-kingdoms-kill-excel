import { CardRegistry } from '../registry/card-registry';
import type { CardDefinition } from '../types/card';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameState } from '../state/game-state';
import type { DeckPile } from '../engine/deck-pile';
import { createCardInstance } from '../engine/card-instance';
import {
  getOnFailEffects,
  getResponseTypeFromEffect,
  isAoeCard,
  removeCardFromHand,
  runCardEffects,
  shaBlockedByArmor,
  formatRenwangBlockedLog,
  validResponseCards,
} from '../engine/effect-runner';
import { canUseAsGuohe, canUseAsLebu, canUseAsSha, validResponseCardsForPlayer } from '../engine/virtual-card';
import { cardNameFromHandEntry, formatHandEntryForLog } from '../engine/card-label';
import {
  applyLockedModifiers,
  playerHasSkill,
  type TimingContext,
} from '../engine/timing-runner';
import {
  getValidTargets,
  isInAttackRange,
  needsTargetSelection,
  sortAoeTargets,
} from '../engine/targeting';
import {
  getEquipSlot,
  hasBaguaFormation,
  playerHasWeapon,
  takeWeaponFromPlayer,
} from '../engine/equipment-zone';
import { nextPromptId } from '../utils/prompt-id';
import {
  type CardPlayContext,
  getZonePickContext,
  setCardPlayContext,
  setZonePickContext,
} from './card-play-context';
import {
  discardZoneCard,
  canDiscardZoneCard,
  getZonePickAction,
  listZoneCards,
  parseZoneCardId,
  takeZoneCard,
} from '../engine/zone-card-pick';

export interface CardPlayHost {
  getState(): GameState;
  getDeck(): DeckPile;
  log(message: string): void;
  setPrompt(prompt: GamePrompt | null): void;
  afterPlayerGainedCards?(player: EnginePlayerState, gainedCards: string[]): void;
  afterPlayerLostHandCards?(player: EnginePlayerState, lostCount: number): void;
  afterPlayerLostEquipmentCards?(player: EnginePlayerState, lostCount: number): void;
  onCardCommitted?(params: {
    source: EnginePlayerState;
    card: CardDefinition;
    targets: EnginePlayerState[];
  }): void;
  scheduleAoeTargets?(sourcePlayerId: string, targetPlayerIds: string[]): void;
  completeTargetResolve?(): void;
  drainStack?(): Promise<{ paused: boolean }>;
  afterPlayerUsedOrRespondedHandCard?(player: EnginePlayerState, cardEntry: string): void;
}

function suitOfCardEntry(entry: string): string | undefined {
  const suit = entry.trim()[0];
  return suit === '♠' || suit === '♥' || suit === '♣' || suit === '♦' ? suit : undefined;
}

function labelForResponseType(responseType: string): string {
  if (responseType === 'shan') return '闪';
  if (responseType === 'sha') return '杀';
  if (responseType === 'tao') return '桃';
  return responseType;
}

function removeResponseCardFromHand(
  player: EnginePlayerState,
  responseType: string,
  cardEntry: string,
): boolean {
  const validCards = validResponseCardsForPlayer(player, responseType, [cardEntry]);
  if (!validCards.includes(cardEntry)) return false;
  const handIndex = player.handCards.indexOf(cardEntry);
  if (handIndex < 0) return false;
  player.handCards.splice(handIndex, 1);
  return true;
}

function hasEquipment(player: EnginePlayerState, equipmentName: string): boolean {
  return player.equipment.some((equipment) => equipment.includes(equipmentName));
}

function zoneCardCount(player: EnginePlayerState): number {
  return player.handCards.length + player.equipment.length;
}

function sortTargetsFromSource(
  players: EnginePlayerState[],
  source: EnginePlayerState,
  targets: EnginePlayerState[],
): EnginePlayerState[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const startIdx = ordered.findIndex((player) => player.id === source.id);
  const result: EnginePlayerState[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const player = ordered[(startIdx + i) % ordered.length]!;
    const target = targets.find((candidate) => candidate.id === player.id);
    if (target && target.hp > 0) result.push(target);
  }
  return result;
}

export class CardPlayService {
  initiatePlayCard(
    host: CardPlayHost,
    sourceId: string,
    cardName: string,
    handIndex?: number,
  ): { ok: boolean; error?: string } {
    if (host.getState().prompt) {
      return { ok: false, error: '请先处理当前提示' };
    }
    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }
    if (source.skillUseCount._yijue_hand_blocked) {
      return { ok: false, error: '受到【义绝】影响，本回合不能使用手牌' };
    }

    const requestedCardName = cardNameFromHandEntry(cardName);
    const zhangbaIndices = this.resolveZhangbaHandIndices(source, requestedCardName, handIndex);
    const index = zhangbaIndices?.[0] ?? this.resolveHandIndex(source, cardName, handIndex);
    if (index < 0) return { ok: false, error: '手牌中没有此牌' };

    const actualEntry = source.handCards[index]!;
    const actualName = cardNameFromHandEntry(actualEntry);
    const virtualCardName = zhangbaIndices
      ? '杀'
      : this.resolveVirtualInitiateCardName(source, actualEntry, requestedCardName);
    if (!virtualCardName) {
      return { ok: false, error: '此牌不能按指定方式使用' };
    }
    const card = CardRegistry.getByName(virtualCardName);
    if (!card) return { ok: false, error: `未知卡牌：${cardName}` };
    if (card.canInitiate === false) {
      return { ok: false, error: '此牌不能主动打出' };
    }

    if (zhangbaIndices) {
      host.log(
        `${source.generalName} 发动【丈八蛇矛】，将 ${zhangbaIndices
          .map((i) => cardNameFromHandEntry(source.handCards[i]!))
          .join('、')} 当【杀】使用`,
      );
    } else if (virtualCardName !== actualName) {
      host.log(`${source.generalName} 将 ${actualEntry} 当【${card.name}】使用`);
    }

    if (!this.canUseShaThisTurn(source, card)) {
      return { ok: false, error: '本回合【杀】已用完' };
    }
    if (!this.canInitiateTao(source, card)) {
      return { ok: false, error: '满血时不能对自己使用【桃】' };
    }

    setCardPlayContext(host.getState().resolution.context, {
      cardId: card.id,
      sourcePlayerId: sourceId,
      handIndex: index,
      zhangbaHandIndices: zhangbaIndices,
      targetPlayerIds: [],
      isAoe: false,
      responsesRequired: 1,
      responseCount: 0,
    });

    if (needsTargetSelection(card)) {
      const validTargets = getValidTargets(card, source, host.getState().players);
      if (validTargets.length === 0) {
        this.clearCardPlay(host);
        return { ok: false, error: '没有合法的目标角色' };
      }
      const max = this.targetMaxForCard(card, source);
      host.setPrompt({
        id: nextPromptId(),
        type: 'select_targets',
        playerId: sourceId,
        cardId: card.id,
        cardName: card.name,
        message: `请选择【${card.name}】的目标（${card.targeting.count?.min ?? 1}~${max} 名）`,
        validTargetIds: validTargets.map((target) => target.id),
      });
      return { ok: true };
    }

    host.setPrompt({
      id: nextPromptId(),
      type: 'play_card_confirm',
      playerId: sourceId,
      cardId: card.id,
      cardName: card.name,
      message: `确认使用【${card.name}】？`,
      options: [
        { id: 'confirm', label: '确认打出' },
        { id: 'cancel', label: '取消' },
      ],
    });
    return { ok: true };
  }

  initiateVirtualSkillCard(
    host: CardPlayHost,
    sourceId: string,
    cardName: string,
    skillId: string,
  ): { ok: boolean; error?: string } {
    const activePrompt = host.getState().prompt;
    const canReplaceSkillPrompt =
      activePrompt?.type === 'use_skill' &&
      activePrompt.skillId === skillId &&
      activePrompt.skillAction === 'virtual_basic' &&
      activePrompt.playerId === sourceId;
    if (activePrompt && !canReplaceSkillPrompt) {
      return { ok: false, error: '请先处理当前提示' };
    }
    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }
    if (source.skillUseCount._yijue_hand_blocked) {
      return { ok: false, error: '受到【义绝】影响，本回合不能使用手牌' };
    }

    const card = CardRegistry.getByName(cardName);
    if (!card || card.type !== 'basic') {
      return { ok: false, error: '只能视为使用基本牌' };
    }
    if (card.canInitiate === false) {
      return { ok: false, error: '此基本牌不能主动使用' };
    }
    if (!this.canUseShaThisTurn(source, card)) {
      return { ok: false, error: '本回合【杀】已用完' };
    }
    if (!this.canInitiateTao(source, card)) {
      return { ok: false, error: '满血时不能对自己使用【桃】' };
    }

    setCardPlayContext(host.getState().resolution.context, {
      cardId: card.id,
      sourcePlayerId: sourceId,
      targetPlayerIds: [],
      isAoe: false,
      responsesRequired: 1,
      responseCount: 0,
      virtualFromSkill: skillId,
    });

    if (needsTargetSelection(card)) {
      const validTargets = getValidTargets(card, source, host.getState().players);
      if (validTargets.length === 0) {
        this.clearCardPlay(host);
        return { ok: false, error: '没有合法的目标角色' };
      }
      const max = this.targetMaxForCard(card, source);
      host.setPrompt({
        id: nextPromptId(),
        type: 'select_targets',
        playerId: sourceId,
        cardId: card.id,
        cardName: card.name,
        skillId,
        message: `【仁德】请选择视为使用【${card.name}】的目标（${card.targeting.count?.min ?? 1}~${max} 名）`,
        validTargetIds: validTargets.map((target) => target.id),
      });
      return { ok: true };
    }

    host.setPrompt({
      id: nextPromptId(),
      type: 'play_card_confirm',
      playerId: sourceId,
      cardId: card.id,
      cardName: card.name,
      skillId,
      message: `【仁德】确认视为使用【${card.name}】？`,
      options: [
        { id: 'confirm', label: '确认使用' },
        { id: 'cancel', label: '取消' },
      ],
    });
    return { ok: true };
  }

  submitZhangba(
    host: CardPlayHost,
    sourceId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().prompt) return { ok: false, error: '请先处理当前提示' };
    if (host.getState().turn.phase !== 'play') return { ok: false, error: '当前不是出牌阶段' };
    if (!hasEquipment(source, '丈八蛇矛')) return { ok: false, error: '未装备【丈八蛇矛】' };
    if (!this.canUseShaThisTurn(source, CardRegistry.getByName('杀')!)) {
      return { ok: false, error: '本回合【杀】已用完' };
    }
    const normalized = [...handIndices].sort((a, b) => a - b);
    if (normalized.length !== 2 || new Set(normalized).size !== 2) {
      return { ok: false, error: '请选择两张不同手牌' };
    }
    if (normalized.some((index) => index < 0 || index >= source.handCards.length)) {
      return { ok: false, error: '所选手牌无效' };
    }
    const card = CardRegistry.getByName('杀');
    if (!card) return { ok: false, error: '缺少【杀】卡牌配置' };
    setCardPlayContext(host.getState().resolution.context, {
      cardId: card.id,
      sourcePlayerId: sourceId,
      handIndex: normalized[0],
      zhangbaHandIndices: normalized,
      targetPlayerIds: [],
      isAoe: false,
      responsesRequired: 1,
      responseCount: 0,
    });
    host.log(
      `${source.generalName} 发动【丈八蛇矛】，将 ${normalized
        .map((index) => cardNameFromHandEntry(source.handCards[index]!))
        .join('、')} 当【杀】使用`,
    );

    const validTargets = getValidTargets(card, source, host.getState().players);
    if (validTargets.length === 0) {
      this.clearCardPlay(host);
      return { ok: false, error: '没有合法的目标角色' };
    }
    const max = this.targetMaxForCard(card, source);
    host.setPrompt({
      id: nextPromptId(),
      type: 'select_targets',
      playerId: sourceId,
      cardId: card.id,
      cardName: card.name,
      message: `请选择【${card.name}】的目标（${card.targeting.count?.min ?? 1}~${max} 名）`,
      validTargetIds: validTargets.map((target) => target.id),
    });
    return { ok: true };
  }

  confirmPlayCard(
    host: CardPlayHost,
    sourceId: string,
    promptId: string,
  ): { ok: boolean; error?: string; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!card || !source) return { ok: false, error: '状态错误' };

    if (needsTargetSelection(card)) {
      const validTargets = getValidTargets(card, source, host.getState().players);
      if (validTargets.length === 0) {
        this.clearCardPlay(host);
        return { ok: false, error: '没有合法的目标角色' };
      }
      const max = this.targetMaxForCard(card, source);
      host.setPrompt({
        id: nextPromptId(),
        type: 'select_targets',
        playerId: sourceId,
        cardId: card.id,
        cardName: card.name,
        message: `请选择【${card.name}】的目标（${card.targeting.count?.min ?? 1}~${max} 名）`,
        validTargetIds: validTargets.map((target) => target.id),
      });
      return { ok: true };
    }

    return this.startResolution(host, sourceId, []);
  }

  selectTargets(
    host: CardPlayHost,
    sourceId: string,
    promptId: string,
    targetIds: string[],
    zoneCardId?: string,
  ): { ok: boolean; error?: string; scheduleAoe?: boolean; paused?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'select_targets') {
      return { ok: false, error: '当前不是选目标阶段' };
    }

    const validTargetIds = new Set(prompt.validTargetIds ?? []);
    for (const targetId of targetIds) {
      if (!validTargetIds.has(targetId)) {
        return { ok: false, error: '目标不合法' };
      }
    }

    const card = CardRegistry.getById(context.cardId);
    const min = card?.targeting.count?.min ?? 1;
    const max = card ? this.targetMaxForCard(card, host.getState().players.find((player) => player.id === sourceId)!) : 1;
    if (targetIds.length < min || targetIds.length > max) {
      return {
        ok: false,
        error: `请选择 ${min}${max > min ? `~${max}` : ''} 个目标`,
      };
    }

    if (card?.id === 'jiedao_sharen' && targetIds.length === 2) {
      const players = host.getState().players;
      const holder = players.find((p) => p.id === targetIds[0]);
      const victim = players.find((p) => p.id === targetIds[1]);
      if (!holder || !victim) {
        return { ok: false, error: '目标无效' };
      }
      if (!playerHasWeapon(holder)) {
        return { ok: false, error: '第一名目标必须装备武器' };
      }
      if (holder.id === victim.id) {
        return { ok: false, error: '两名目标不能相同' };
      }
      if (!isInAttackRange(players, holder, victim)) {
        return { ok: false, error: '第二名目标须在持刀者攻击范围内' };
      }
    }

    if (zoneCardId) {
      if (!getZonePickAction(card!)) {
        return { ok: false, error: '当前卡牌不需要选择区域牌' };
      }
      if (!parseZoneCardId(zoneCardId)) {
        return { ok: false, error: '请选择一张牌' };
      }
      context.pendingZoneCardId = zoneCardId;
      setCardPlayContext(host.getState().resolution.context, context);
    }

    return this.startResolution(host, sourceId, targetIds);
  }

  startResolution(
    host: CardPlayHost,
    sourceId: string,
    targetIds: string[],
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const context = this.requireCardPlay(host);
    if (!context) return { ok: false, error: '无进行中的用牌' };

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!card || !source) {
      this.clearCardPlay(host);
      return { ok: false, error: '结算失败' };
    }

    let targets = targetIds
      .map((id) => host.getState().players.find((player) => player.id === id))
      .filter((player): player is EnginePlayerState => !!player);

    if (targets.length === 0 && card.targeting.selector === 'self') {
      targets = [source];
    }
    if (
      targets.length === 0 &&
      (card.targeting.selector === 'allOthers' || card.targeting.selector === 'all')
    ) {
      targets = getValidTargets(card, source, host.getState().players);
    }

    context.targetPlayerIds = targets.map((target) => target.id);
    setCardPlayContext(host.getState().resolution.context, context);

    this.commitPlayedCard(host, source, card, context, targets);

    if (this.shouldPromptWuxie(card, context.targetPlayerIds)) {
      context.wuxieQueue = this.collectWuxieQueue(host, source.id);
      context.wuxieCancelledTargetIds = [];
      context.wuxieCancelledAll = false;
      setCardPlayContext(host.getState().resolution.context, context);
      return this.promptNextWuxie(host, card, source, context);
    }

    return this.continueResolution(host, card, source, targets, context);
  }

  resolveTargetResponse(host: CardPlayHost, targetId: string): void {
    const context = this.requireCardPlay(host);
    if (!context) return;

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((player) => player.id === context.sourcePlayerId);
    const target = host.getState().players.find((player) => player.id === targetId);
    if (!card || !source || !target) return;

    if (target.hp <= 0 || target.dead) {
      host.log(`${target.generalName} 已阵亡，跳过【${card.name}】响应`);
      host.completeTargetResolve?.();
      return;
    }

    context.awaitingResponseFrom = targetId;
    context.responseCount = 0;
    setCardPlayContext(host.getState().resolution.context, context);
    this.promptResponse(host, card, source, target, context);
  }

  promptResponse(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; paused: boolean } {
    const responseType = context.responseType ?? getResponseTypeFromEffect(card);
    if (!responseType) {
      host.setPrompt(null);
      return { ok: true, paused: false };
    }

    const tieqiBlocked =
      responseType === 'shan' && (context.tieqiBlockedTargetIds ?? []).includes(target.id);
    const validCards = tieqiBlocked
      ? []
      : validResponseCardsForPlayer(target, responseType, target.handCards);
    const label = labelForResponseType(responseType);
    const required = context.responsesRequired;
    const count = context.responseCount;
    const hint =
      required > 1 ? `（需 ${required} 张【${label}】，已 ${count}/${required}）` : '';

    const duelActive = context.duelActive === true;
    const jiedaoVictim = context.jiedaoVictimId
      ? host.getState().players.find((player) => player.id === context.jiedaoVictimId)
      : undefined;
    const message = context.jiedaoActive
      ? `${target.generalName}：【借刀杀人】请对 ${jiedaoVictim?.generalName ?? '目标'} 使用一张【杀】，否则失去武器`
      : duelActive
      ? `${target.generalName}：请打出【${label}】继续决斗${hint}（不出则受到 1 点伤害）`
      : tieqiBlocked
      ? `${target.generalName}：受到【铁骑】影响，不能使用【闪】响应【${card.name}】`
      : `${target.generalName}：请打出【${label}】响应【${card.name}】${hint}`;
    const passLabel = duelActive ? '不出（承受伤害）' : '不出（承受效果）';

    host.setPrompt({
      id: nextPromptId(),
      type: 'response',
      playerId: target.id,
      sourcePlayerId: source.id,
      cardName: card.name,
      message,
      validResponseCards: validCards,
      targetPlayerIds: context.targetPlayerIds,
      options: [
        ...validCards.map((validCard) => ({
          id: `card:${validCard}`,
          label: `打出【${validCard}】`,
        })),
        { id: 'pass', label: passLabel },
        ...(hasBaguaFormation(target) && responseType === 'shan'
          ? [{ id: 'bagua', label: '发动【八卦阵】判定' }]
          : []),
        ...(this.canStartLordAssist(host, target, responseType)
          ? [{ id: `lord_assist:${responseType}`, label: `发动主公技代出【${label}】` }]
          : []),
      ],
    });
    return { ok: true, paused: true };
  }

  async submitResponse(
    host: CardPlayHost,
    responderId: string,
    promptId: string,
    choiceId: string,
    onDamage: (params: {
      sourceId: string;
      targetId: string;
      amount: number;
      damageCardName?: string;
    }) => Promise<void>,
  ): Promise<{ ok: boolean; error?: string; paused?: boolean }> {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'response' || prompt.playerId !== responderId) {
      return { ok: false, error: '当前不能由你响应' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find(
      (player) => player.id === context.sourcePlayerId,
    );
    const responder = host.getState().players.find((player) => player.id === responderId);
    if (!card || !source || !responder) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }
    if (responder.skillUseCount._yijue_hand_blocked && choiceId !== 'pass') {
      return { ok: false, error: '受到【义绝】影响，本回合不能打出手牌' };
    }
    if (
      choiceId !== 'pass' &&
      context.responseType === 'shan' &&
      (context.tieqiBlockedTargetIds ?? []).includes(responder.id)
    ) {
      return { ok: false, error: '受到【铁骑】影响，不能使用【闪】响应此【杀】' };
    }

    if (context.awaitingWuxieFrom) {
      return this.submitWuxieResponse(
        host,
        responder,
        source,
        card,
        context,
        choiceId,
      );
    }

    if (choiceId.startsWith('lord_assist:')) {
      const responseType = choiceId.slice('lord_assist:'.length);
      if (responseType !== context.responseType) {
        return { ok: false, error: '主公技响应类型不匹配' };
      }
      return this.startLordAssist(host, card, source, responder, context, responseType);
    }

    if (choiceId.startsWith('lord:')) {
      return this.submitLordAssist(host, responder, source, card, context, choiceId);
    }

    const required = context.responsesRequired;
    const aoeActive = context.isAoe === true;
    const duelActive = context.duelActive === true;
    const jiedaoActive = context.jiedaoActive === true;

    if (choiceId === 'bagua') {
      const suits = ['♠', '♥', '♣', '♦'];
      const suit = suits[Math.floor(Math.random() * 4)]!;
      const isRed = suit === '♥' || suit === '♦';
      host.log(
        `${responder.generalName} 【八卦阵】判定：${suit} → ${isRed ? '视为【闪】' : '无效'}`,
      );
      if (isRed) {
        context.responseCount += 1;
        setCardPlayContext(host.getState().resolution.context, context);
        if (context.responseCount < required) {
          return this.promptResponse(host, card, source, responder, context);
        }
        host.setPrompt(null);
        if (aoeActive) {
          host.log(`【${card.name}】对 ${responder.generalName} 被抵消`);
          host.completeTargetResolve?.();
          await host.drainStack?.();
          if (host.getState().resolution.targetQueue == null) this.clearCardPlay(host);
          return { ok: true, paused: host.getState().prompt != null };
        }
        this.clearCardPlay(host);
        host.log(`【${card.name}】被抵消`);
        return { ok: true };
      }
      return { ok: true, paused: true };
    }

    if (choiceId.startsWith('card:')) {
      const cardName = choiceId.slice(5);
      if (!removeCardFromHand(responder, cardName)) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      host.getDeck().discardCard(cardName);
      host.afterPlayerUsedOrRespondedHandCard?.(responder, cardName);

      if (duelActive) {
        context.responseCount += 1;
        host.log(
          `${responder.generalName} 打出【${cardName}】（${context.responseCount}/${required}）`,
        );
        if (context.responseCount < required) {
          setCardPlayContext(host.getState().resolution.context, context);
          return this.promptResponse(host, card, source, responder, context);
        }

        const nextResponderId =
          responder.id === context.duelTarget
            ? context.duelInitiator
            : context.duelTarget;
        const nextResponder = host
          .getState()
          .players.find((player) => player.id === nextResponderId);
        if (!nextResponder) {
          this.clearCardPlay(host);
          host.setPrompt(null);
          return { ok: false, error: '决斗对手不存在' };
        }
        context.awaitingResponseFrom = nextResponder.id;
        context.responseCount = 0;
        setCardPlayContext(host.getState().resolution.context, context);
        return this.promptResponse(host, card, source, nextResponder, context);
      }

      context.responseCount += 1;
      host.log(
        `${responder.generalName} 打出 ${formatHandEntryForLog(cardName)}（${context.responseCount}/${required}）`,
      );
      setCardPlayContext(host.getState().resolution.context, context);

      if (jiedaoActive && context.jiedaoHolderId === responder.id) {
        const victim = host
          .getState()
          .players.find((player) => player.id === context.jiedaoVictimId);
        if (!victim) {
          this.clearCardPlay(host);
          host.setPrompt(null);
          return { ok: false, error: '借刀目标不存在' };
        }
        host.setPrompt(null);
        return this.beginShaResponseAgainstTarget(
          host,
          responder,
          victim,
          cardName,
          context,
          '借刀杀人',
        );
      }

      if (context.responseCount < required) {
        return this.promptResponse(host, card, source, responder, context);
      }
      host.setPrompt(null);
      if (aoeActive) {
        host.log(`【${card.name}】对 ${responder.generalName} 被抵消`);
        host.completeTargetResolve?.();
        await host.drainStack?.();
        if (host.getState().resolution.targetQueue == null) this.clearCardPlay(host);
        return { ok: true, paused: host.getState().prompt != null };
      }
      if (card.id === 'sha' && this.promptShaDodgedEquipment(host, source, responder, context)) {
        return { ok: true, paused: true };
      }
      this.clearCardPlay(host);
      host.log(`【${card.name}】被抵消`);
      return { ok: true };
    }

    if (choiceId === 'pass') {
      host.log(`${responder.generalName} 未响应【${card.name}】`);

      if (jiedaoActive && context.jiedaoHolderId === responder.id) {
        host.setPrompt(null);
        const equipmentCountBefore = responder.equipment.length;
        takeWeaponFromPlayer(
          responder,
          source,
          host.getDeck(),
          (message) => host.log(message),
        );
        host.afterPlayerLostEquipmentCards?.(
          responder,
          equipmentCountBefore - responder.equipment.length,
        );
        this.clearCardPlay(host);
        return { ok: true };
      }

      const onFail = getOnFailEffects(card);
      const damageEffect = onFail.find((effect) => effect.action === 'damage');
      const amount = this.applyDamageBuffs(
        source,
        card,
        (damageEffect?.params?.amount as number) ?? 1,
      );

      host.setPrompt(null);

      // 决斗：不出【杀】者受到来自决斗使用者的 1 点伤害
      if (duelActive) {
        this.clearCardPlay(host);
        await onDamage({
          sourceId: context.duelInitiator ?? source.id,
          targetId: responder.id,
          amount,
          damageCardName: context.committedCardEntry ?? card.name,
        });
        return { ok: true, paused: host.getState().prompt != null };
      }

      if (aoeActive) {
        host.completeTargetResolve?.();
        await onDamage({
          sourceId: source.id,
          targetId: responder.id,
          amount,
          damageCardName: context.committedCardEntry ?? card.name,
        });
        if (host.getState().prompt) {
          context.pendingAoeAdvance = true;
          setCardPlayContext(host.getState().resolution.context, context);
          return { ok: true, paused: true };
        }
        await host.drainStack?.();
        if (host.getState().resolution.targetQueue == null) {
          this.clearCardPlay(host);
          host.log('锦囊/AOE 响应结算完毕');
        }
        return { ok: true, paused: false };
      }

      this.clearCardPlay(host);
      await onDamage({
        sourceId: source.id,
        targetId: responder.id,
        amount,
        damageCardName: context.committedCardEntry ?? card.name,
      });
      return { ok: true, paused: host.getState().prompt != null };
    }

    return { ok: false, error: '无效选择' };
  }

  cancelPlay(host: CardPlayHost): void {
    this.clearCardPlay(host);
    setZonePickContext(host.getState().resolution.context, undefined);
    host.setPrompt(null);
  }

  private canStartLordAssist(
    host: CardPlayHost,
    lord: EnginePlayerState,
    responseType: string,
  ): boolean {
    if (lord.role !== '主公' || lord.dead || lord.hp <= 0) return false;
    const skillId = responseType === 'shan' ? 'hujia' : responseType === 'sha' ? 'jijiang' : undefined;
    if (!skillId || !playerHasSkill(lord, skillId)) return false;
    const kingdom = skillId === 'hujia' ? 'wei' : 'shu';
    return host.getState().players.some(
      (player) =>
        player.id !== lord.id &&
        player.kingdom === kingdom &&
        player.hp > 0 &&
        !player.dead &&
        validResponseCardsForPlayer(player, responseType, player.handCards).length > 0,
    );
  }

  private startLordAssist(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    lord: EnginePlayerState,
    context: CardPlayContext,
    responseType: string,
  ): { ok: boolean; error?: string; paused?: boolean } {
    const skillId = responseType === 'shan' ? 'hujia' : responseType === 'sha' ? 'jijiang' : undefined;
    if (!skillId || !this.canStartLordAssist(host, lord, responseType)) {
      return { ok: false, error: '当前不能发动主公技' };
    }
    const kingdom = skillId === 'hujia' ? 'wei' : 'shu';
    const queue = host.getState().players
      .filter(
        (player) =>
          player.id !== lord.id &&
          player.kingdom === kingdom &&
          player.hp > 0 &&
          !player.dead,
      )
      .sort((left, right) => left.seat - right.seat)
      .map((player) => player.id);
    context.lordAssist = {
      skillId,
      lordId: lord.id,
      responseType: responseType as 'shan' | 'sha',
      queue,
      index: 0,
    };
    setCardPlayContext(host.getState().resolution.context, context);
    host.log(`${lord.generalName} 发动【${skillId === 'hujia' ? '护驾' : '激将'}】`);
    return this.promptNextLordAssist(host, card, source, context);
  }

  private promptNextLordAssist(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; error?: string; paused?: boolean } {
    const assist = context.lordAssist;
    if (!assist) return { ok: false, error: '主公技状态不存在' };
    while (assist.index < assist.queue.length) {
      const assistantId = assist.queue[assist.index]!;
      assist.index += 1;
      const assistant = host.getState().players.find((player) => player.id === assistantId);
      if (!assistant || assistant.hp <= 0 || assistant.dead) continue;
      const validCards = validResponseCardsForPlayer(assistant, assist.responseType, assistant.handCards);
      if (validCards.length === 0) continue;
      setCardPlayContext(host.getState().resolution.context, context);
      const label = labelForResponseType(assist.responseType);
      const skillName = assist.skillId === 'hujia' ? '护驾' : '激将';
      host.setPrompt({
        id: nextPromptId(),
        type: 'response',
        playerId: assistant.id,
        sourcePlayerId: source.id,
        cardName: card.name,
        targetPlayerIds: context.targetPlayerIds,
        message: `${assistant.generalName}：是否响应【${skillName}】，为主公打出【${label}】？`,
        validResponseCards: validCards,
        options: [
          ...validCards.map((validCard) => ({
            id: `lord:card:${validCard}`,
            label: `打出【${validCard}】`,
          })),
          { id: 'lord:pass', label: '不出' },
        ],
      });
      return { ok: true, paused: true };
    }

    const lord = host.getState().players.find((player) => player.id === assist.lordId);
    delete context.lordAssist;
    setCardPlayContext(host.getState().resolution.context, context);
    if (lord) {
      host.log(`${lord.generalName} 的【${assist.skillId === 'hujia' ? '护驾' : '激将'}】无人响应`);
      return this.promptResponse(host, card, source, lord, context);
    }
    return { ok: false, error: '主公不存在' };
  }

  private submitLordAssist(
    host: CardPlayHost,
    assistant: EnginePlayerState,
    source: EnginePlayerState,
    card: CardDefinition,
    context: CardPlayContext,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string; paused?: boolean }> | { ok: boolean; error?: string; paused?: boolean } {
    const assist = context.lordAssist;
    if (!assist) return { ok: false, error: '当前未在主公技响应流程中' };
    const lord = host.getState().players.find((player) => player.id === assist.lordId);
    if (!lord) return { ok: false, error: '主公不存在' };

    if (choiceId === 'lord:pass') {
      host.log(`${assistant.generalName} 不响应【${assist.skillId === 'hujia' ? '护驾' : '激将'}】`);
      return this.promptNextLordAssist(host, card, source, context);
    }

    if (!choiceId.startsWith('lord:card:')) return { ok: false, error: '无效选择' };
    const cardEntry = choiceId.slice('lord:card:'.length);
    if (!removeResponseCardFromHand(assistant, assist.responseType, cardEntry)) {
      return { ok: false, error: '手牌中没有可响应的牌' };
    }
    host.getDeck().discardCard(cardEntry);
    lord.skillUseCount[assist.skillId] = (lord.skillUseCount[assist.skillId] ?? 0) + 1;
    context.responseCount += 1;
    delete context.lordAssist;
    setCardPlayContext(host.getState().resolution.context, context);
    const label = labelForResponseType(assist.responseType);
    host.log(`${assistant.generalName} 响应【${assist.skillId === 'hujia' ? '护驾' : '激将'}】，替 ${lord.generalName} 打出【${label}】`);

    if (context.duelActive) {
      if (context.responseCount < context.responsesRequired) {
        return this.promptResponse(host, card, source, lord, context);
      }

      const nextResponderId =
        lord.id === context.duelTarget ? context.duelInitiator : context.duelTarget;
      const nextResponder = host
        .getState()
        .players.find((player) => player.id === nextResponderId);
      if (!nextResponder) {
        this.clearCardPlay(host);
        host.setPrompt(null);
        return { ok: false, error: '决斗对手不存在' };
      }
      context.awaitingResponseFrom = nextResponder.id;
      context.responseCount = 0;
      setCardPlayContext(host.getState().resolution.context, context);
      return this.promptResponse(host, card, source, nextResponder, context);
    }

    if (context.responseCount < context.responsesRequired) {
      return this.promptResponse(host, card, source, lord, context);
    }
    host.setPrompt(null);
    if (context.isAoe === true) {
      host.log(`【${card.name}】对 ${lord.generalName} 被抵消`);
      host.completeTargetResolve?.();
      return host.drainStack?.().then(() => {
        if (host.getState().resolution.targetQueue == null) this.clearCardPlay(host);
        return { ok: true, paused: host.getState().prompt != null };
      }) ?? { ok: true, paused: host.getState().prompt != null };
    }
    this.clearCardPlay(host);
    host.log(`【${card.name}】被抵消`);
    return { ok: true };
  }

  private commitPlayedCard(
    host: CardPlayHost,
    source: EnginePlayerState,
    card: CardDefinition,
    context: CardPlayContext,
    targets: EnginePlayerState[],
  ): void {
    if (context.cardCommitted) return;

    const handCountBefore = source.handCards.length;
    context.committedCardEntry = context.virtualFromSkill
      ? card.name
      : source.handCards[context.handIndex ?? -1] ?? card.name;
    if (!context.virtualFromSkill) {
      if (context.zhangbaHandIndices?.length === 2) {
        const ascending = [...context.zhangbaHandIndices].sort((left, right) => left - right);
        const usedEntries = ascending
          .map((index) => source.handCards[index])
          .filter((entry): entry is string => !!entry);
        for (const index of [...ascending].sort((left, right) => right - left)) {
          source.handCards.splice(index, 1);
        }
        context.committedCardEntry = usedEntries.join('、') || card.name;
        for (const entry of usedEntries) host.getDeck().discardCard(entry);
      } else {
        const usedEntry = source.handCards[context.handIndex ?? -1] ?? card.name;
        removeCardFromHand(source, card.name, context.handIndex);
        host.getDeck().discardCard(usedEntry);
      }
      host.afterPlayerLostHandCards?.(source, handCountBefore - source.handCards.length);
      host.afterPlayerUsedOrRespondedHandCard?.(source, context.committedCardEntry);
    }
    if (card.id === 'sha') source.shaUsedCount += 1;

    const targetLabel =
      targets.map((target) => target.generalName).join('、') || '全场';
    const prefix = context.virtualFromSkill === 'rende' ? '发动【仁德】，视为' : '';
    const cardLabel =
      card.id === 'sha'
        ? formatHandEntryForLog(context.committedCardEntry ?? card.name)
        : `【${card.name}】`;
    host.log(`${source.generalName} ${prefix}对 ${targetLabel} 使用${cardLabel}`);
    host.onCardCommitted?.({ source, card, targets });

    context.cardCommitted = true;
    setCardPlayContext(host.getState().resolution.context, context);
  }

  submitZoneCardSelection(
    host: CardPlayHost,
    sourceId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const prompt = host.getState().prompt;
    const zonePick = getZonePickContext(host.getState().resolution.context);
    if (!prompt || prompt.id !== promptId || !zonePick) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'select_zone_card' || prompt.playerId !== sourceId) {
      return { ok: false, error: '当前不能选牌' };
    }

    const parsed = parseZoneCardId(choiceId);
    if (!parsed) return { ok: false, error: '请选择一张牌' };

    const source = host.getState().players.find(
      (player) => player.id === zonePick.sourcePlayerId,
    );
    const target = host.getState().players.find(
      (player) => player.id === zonePick.targetPlayerId,
    );
    const playContext = this.requireCardPlay(host);
    const card =
      CardRegistry.getById(playContext?.cardId ?? prompt.cardId ?? '') ??
      undefined;
    if (!source || !target || !playContext || !card) {
      this.clearCardPlay(host);
      setZonePickContext(host.getState().resolution.context, undefined);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    this.commitPlayedCard(host, source, card, playContext, [target]);

    const targetHandCountBefore = target.handCards.length;
    const targetEquipmentCountBefore = target.equipment.length;
    const sourceHandCountBefore = source.handCards.length;
    const ok =
      zonePick.action === 'discard'
        ? discardZoneCard(
            target,
            parsed.zone,
            parsed.index,
            host.getDeck(),
            (message) => host.log(message),
            source,
          )
        : takeZoneCard(target, source, parsed.zone, parsed.index, (message) =>
            host.log(message),
          );

    if (!ok) return { ok: false, error: '所选牌无效' };
    if (zonePick.action === 'take' && source.handCards.length > sourceHandCountBefore) {
      host.afterPlayerGainedCards?.(source, source.handCards.slice(sourceHandCountBefore));
    }
    host.afterPlayerLostHandCards?.(target, targetHandCountBefore - target.handCards.length);
    host.afterPlayerLostEquipmentCards?.(
      target,
      targetEquipmentCountBefore - target.equipment.length,
    );

    playContext.pendingZoneCardId = undefined;
    this.clearCardPlay(host);
    setZonePickContext(host.getState().resolution.context, undefined);
    host.setPrompt(null);
    return { ok: true };
  }

  async advanceAoeIfPending(host: CardPlayHost): Promise<void> {
    const context = this.requireCardPlay(host);
    if (!context?.pendingAoeAdvance || host.getState().prompt) return;
    context.pendingAoeAdvance = false;
    setCardPlayContext(host.getState().resolution.context, context);
    host.completeTargetResolve?.();
    await host.drainStack?.();
    if (host.getState().resolution.targetQueue == null) {
      this.clearCardPlay(host);
      host.log('锦囊/AOE 响应结算完毕');
    }
  }

  private continueResolution(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    targets: EnginePlayerState[],
    context: CardPlayContext,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    if (context.wuxieCancelledAll) {
      this.commitPlayedCard(host, source, card, context, targets);
      host.log(`【${card.name}】被抵消`);
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }

    const cancelledTargets = new Set([
      ...(context.wuxieCancelledTargetIds ?? []),
      ...(context.qianxunCancelledTargetIds ?? []),
      ...(context.fenweiCancelledTargetIds ?? []),
    ]);
    const finalTargets = targets.filter((target) => !cancelledTargets.has(target.id));
    context.targetPlayerIds = finalTargets.map((target) => target.id);

    if (finalTargets.length === 0 && targets.length > 0) {
      this.commitPlayedCard(host, source, card, context, targets);
      host.log(`【${card.name}】被抵消`);
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }

    const qianxunTarget = this.findQianxunTarget(card, finalTargets, context);
    if (qianxunTarget) {
      context.awaitingQianxunFrom = qianxunTarget.id;
      context.qianxunOfferedTargetIds = [
        ...(context.qianxunOfferedTargetIds ?? []),
        qianxunTarget.id,
      ];
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: qianxunTarget.id,
        skillId: 'qianxun',
        skillName: '谦逊',
        sourcePlayerId: source.id,
        cardId: card.id,
        cardName: card.name,
        targetPlayerIds: [qianxunTarget.id],
        discardCount: 2,
        discardHandIndices: qianxunTarget.handCards.map((_, index) => index),
        message: `${qianxunTarget.generalName}：是否发动【谦逊】，弃置两张手牌并取消【${card.name}】对你的影响？`,
        options: [
          { id: 'skill:qianxun', label: '发动【谦逊】' },
          { id: 'skip', label: '不发动' },
        ],
      });
      return { ok: true, paused: true };
    }

    const fenweiTarget = this.findFenweiTarget(card, targets, finalTargets, context);
    if (fenweiTarget) {
      context.fenweiOfferedTargetIds = [
        ...(context.fenweiOfferedTargetIds ?? []),
        fenweiTarget.id,
      ];
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: fenweiTarget.id,
        skillId: 'fenwei',
        skillName: '奋威',
        sourcePlayerId: source.id,
        cardId: card.id,
        cardName: card.name,
        targetPlayerIds: [fenweiTarget.id],
        discardCount: 1,
        discardHandIndices: fenweiTarget.handCards.map((_, index) => index),
        skillCardOptions: listZoneCards(fenweiTarget, { hideHand: false, shuffleHand: false }),
        message: `${fenweiTarget.generalName}：是否发动【奋威】，弃置一张牌并取消【${card.name}】对你的影响？`,
        options: [
          { id: 'skill:fenwei', label: '发动【奋威】' },
          { id: 'skip', label: '不发动' },
        ],
      });
      return { ok: true, paused: true };
    }

    const liuliTarget = this.findLiuliTarget(host, source, card, finalTargets, context);
    if (liuliTarget) {
      const redirectTargets = host
        .getState()
        .players.filter(
          (player) =>
            player.id !== source.id &&
            player.id !== liuliTarget.id &&
            player.hp > 0 &&
            !player.dead &&
            isInAttackRange(host.getState().players, liuliTarget, player),
        );
      context.awaitingLiuliFrom = liuliTarget.id;
      context.liuliOfferedTargetIds = [
        ...(context.liuliOfferedTargetIds ?? []),
        liuliTarget.id,
      ];
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: liuliTarget.id,
        skillId: 'liuli',
        skillName: '流离',
        sourcePlayerId: source.id,
        cardId: card.id,
        cardName: card.name,
        targetPlayerIds: [liuliTarget.id],
        validTargetIds: redirectTargets.map((player) => player.id),
        discardCount: 1,
        discardHandIndices: liuliTarget.handCards.map((_, index) => index),
        skillCardOptions: listZoneCards(liuliTarget, { hideHand: true, shuffleHand: true }),
        message: `${liuliTarget.generalName}：是否发动【流离】，弃置一张牌并转移【杀】？`,
        options: [
          { id: 'skill:liuli', label: '发动【流离】' },
          { id: 'skip', label: '不发动' },
        ],
      });
      return { ok: true, paused: true };
    }

    const tieqiTarget = this.findTieqiTarget(card, source, finalTargets, context);
    if (tieqiTarget) {
      return this.promptTieqiOffer(host, card, source, tieqiTarget, context);
    }

    const responseType = getResponseTypeFromEffect(card);
    if (
      responseType &&
      isAoeCard(card) &&
      finalTargets.length > 0 &&
      host.scheduleAoeTargets
    ) {
      const sortedTargets = sortAoeTargets(host.getState().players, source, finalTargets);
      context.targetPlayerIds = sortedTargets.map((target) => target.id);
      context.responseType = responseType;
      context.isAoe = true;
      context.responsesRequired = 1;
      context.responseCount = 0;
      const timingContext: TimingContext = { source, card, responsesRequired: 1 };
      applyLockedModifiers(timingContext);
      context.responsesRequired = timingContext.responsesRequired ?? 1;
      setCardPlayContext(host.getState().resolution.context, context);
      this.commitPlayedCard(host, source, card, context, finalTargets);
      host.setPrompt(null);
      host.scheduleAoeTargets(source.id, context.targetPlayerIds);
      return { ok: true, scheduleAoe: true };
    }

    if (card.id === 'jiedao_sharen' && finalTargets.length >= 2) {
      const holder = finalTargets[0]!;
      const victim = finalTargets[1]!;
      context.jiedaoHolderId = holder.id;
      context.jiedaoVictimId = victim.id;
      context.jiedaoActive = true;
      context.responseType = 'sha';
      context.responsesRequired = 1;
      context.responseCount = 0;
      context.awaitingResponseFrom = holder.id;
      setCardPlayContext(host.getState().resolution.context, context);
      this.commitPlayedCard(host, source, card, context, finalTargets);
      return this.promptResponse(host, card, source, holder, context);
    }

    if (card.effects.some((effect) => effect.action === 'distributeRevealed')) {
      this.commitPlayedCard(host, source, card, context, finalTargets);
      return this.startWuguDistribution(host, source, context);
    }

    if (responseType && finalTargets.length > 0) {
      const target = finalTargets[0]!;
      if (card.id === 'sha' && shaBlockedByArmor(source, target, context.committedCardEntry)) {
        host.log(formatRenwangBlockedLog(target.generalName, context.committedCardEntry));
        this.clearCardPlay(host);
        host.setPrompt(null);
        return { ok: true };
      }

      const timingContext: TimingContext = {
        source,
        targets: finalTargets,
        card,
        responsesRequired: 1,
      };
      applyLockedModifiers(timingContext);
      context.responsesRequired = timingContext.responsesRequired ?? 1;
      context.responseType = responseType;
      context.isAoe = false;
      context.responseCount = 0;
      context.awaitingResponseFrom = target.id;

      // 决斗：轮流出【杀】流程，目标先出。响应人切换由 submitResponse 处理
      if (card.id === 'juedou') {
        context.duelActive = true;
        context.duelInitiator = source.id;
        context.duelTarget = target.id;
      }

      setCardPlayContext(host.getState().resolution.context, context);
      return this.promptResponse(host, card, source, target, context);
    }

    const zonePickAction = getZonePickAction(card);
    if (zonePickAction && finalTargets.length > 0) {
      const context = this.requireCardPlay(host);
      if (context?.pendingZoneCardId) {
        const parsed = parseZoneCardId(context.pendingZoneCardId);
        if (parsed) {
          this.commitPlayedCard(host, source, card, context, [finalTargets[0]!]);
          const targetEquipmentCountBefore = finalTargets[0]!.equipment.length;
          const sourceHandCountBefore = source.handCards.length;
          const ok =
            zonePickAction === 'discard'
              ? discardZoneCard(
                  finalTargets[0]!,
                  parsed.zone,
                  parsed.index,
                  host.getDeck(),
                  (message) => host.log(message),
                  source,
                )
              : takeZoneCard(finalTargets[0]!, source, parsed.zone, parsed.index, (message) =>
                  host.log(message),
                );

          if (ok) {
            if (zonePickAction === 'take' && source.handCards.length > sourceHandCountBefore) {
              host.afterPlayerGainedCards?.(source, source.handCards.slice(sourceHandCountBefore));
            }
            host.afterPlayerLostEquipmentCards?.(
              finalTargets[0]!,
              targetEquipmentCountBefore - finalTargets[0]!.equipment.length,
            );
            context.pendingZoneCardId = undefined;
            this.clearCardPlay(host);
            setZonePickContext(host.getState().resolution.context, undefined);
            host.setPrompt(null);
            return { ok: true };
          }
        }
      }

      return this.promptZoneCardPick(
        host,
        card,
        source,
        finalTargets[0]!,
        zonePickAction,
      );
    }

    this.commitPlayedCard(host, source, card, context, finalTargets);
    this.runImmediateEffects(host, card, source, finalTargets);
    this.clearCardPlay(host);
    host.setPrompt(null);
    return { ok: true };
  }

  private shouldPromptWuxie(card: CardDefinition, targetPlayerIds: string[]): boolean {
    return card.type === 'trick' && card.name !== '无懈可击' && targetPlayerIds.length > 0;
  }

  submitQianxun(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
    handIndices: number[] = [],
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'qianxun' || playerId !== prompt.playerId) {
      return { ok: false, error: '当前不能发动【谦逊】' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((p) => p.id === context.sourcePlayerId);
    const player = host.getState().players.find((p) => p.id === playerId);
    if (!card || !source || !player) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId === 'skip') {
      context.awaitingQianxunFrom = undefined;
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt(null);
      const targets = context.targetPlayerIds
        .map((id) => host.getState().players.find((p) => p.id === id))
        .filter((p): p is EnginePlayerState => !!p);
      return this.continueResolution(host, card, source, targets, context);
    }

    if (choiceId !== 'skill:qianxun') {
      return { ok: false, error: '无效选择' };
    }
    if (handIndices.length !== 2) {
      return { ok: false, error: '请选择两张手牌弃置' };
    }

    const sorted = [...handIndices].sort((left, right) => right - left);
    if (new Set(sorted).size !== handIndices.length) {
      return { ok: false, error: '不能重复选择同一张手牌' };
    }
    const handCountBefore = player.handCards.length;
    const discarded: string[] = [];
    for (const index of sorted) {
      if (index < 0 || index >= player.handCards.length) {
        return { ok: false, error: '所选手牌无效' };
      }
      const cardEntry = player.handCards.splice(index, 1)[0]!;
      host.getDeck().discardCard(cardEntry);
      discarded.push(cardEntry);
    }

    host.afterPlayerLostHandCards?.(player, handCountBefore - player.handCards.length);
    context.awaitingQianxunFrom = undefined;
    context.qianxunCancelledTargetIds = [
      ...(context.qianxunCancelledTargetIds ?? []),
      player.id,
    ];
    setCardPlayContext(host.getState().resolution.context, context);
    host.log(
      `${player.generalName} 发动【谦逊】，弃置 ${discarded.join('、')}，取消【${card.name}】对自己的影响`,
    );
    host.setPrompt(null);
    const targets = context.targetPlayerIds
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);
    return this.continueResolution(host, card, source, targets, context);
  }

  submitLiuli(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
    redirectTargetId?: string,
    zoneCardId?: string,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'liuli' || playerId !== prompt.playerId) {
      return { ok: false, error: '当前不能发动【流离】' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((p) => p.id === context.sourcePlayerId);
    const player = host.getState().players.find((p) => p.id === playerId);
    if (!card || !source || !player) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId === 'skip') {
      context.awaitingLiuliFrom = undefined;
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt(null);
      const targets = context.targetPlayerIds
        .map((id) => host.getState().players.find((p) => p.id === id))
        .filter((p): p is EnginePlayerState => !!p);
      return this.continueResolution(host, card, source, targets, context);
    }

    if (choiceId !== 'skill:liuli') return { ok: false, error: '无效选择' };
    if (!redirectTargetId || !prompt.validTargetIds?.includes(redirectTargetId)) {
      return { ok: false, error: '请选择合法的转移目标' };
    }
    if (!zoneCardId) return { ok: false, error: '请选择一张牌弃置' };
    const parsed = parseZoneCardId(zoneCardId);
    if (!parsed || parsed.zone === 'judge') return { ok: false, error: '所选牌无效' };

    const handCountBefore = player.handCards.length;
    const equipmentCountBefore = player.equipment.length;
    const discarded = discardZoneCard(player, parsed.zone, parsed.index, host.getDeck(), (message) =>
      host.log(message),
    );
    if (!discarded) return { ok: false, error: '所选牌无效' };
    host.afterPlayerLostHandCards?.(player, handCountBefore - player.handCards.length);
    host.afterPlayerLostEquipmentCards?.(
      player,
      equipmentCountBefore - player.equipment.length,
    );

    const nextTargets = context.targetPlayerIds.map((id) =>
      id === player.id ? redirectTargetId : id,
    );
    context.awaitingLiuliFrom = undefined;
    context.targetPlayerIds = nextTargets;
    setCardPlayContext(host.getState().resolution.context, context);

    const redirected = host.getState().players.find((p) => p.id === redirectTargetId);
    player.skillUseCount.liuli = (player.skillUseCount.liuli ?? 0) + 1;
    host.log(
      `${player.generalName} 发动【流离】，将【杀】转移给 ${redirected?.generalName ?? '目标'}`,
    );
    host.setPrompt(null);
    const targets = nextTargets
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);
    return this.continueResolution(host, card, source, targets, context);
  }

  submitTieqi(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'tieqi' || playerId !== prompt.playerId) {
      return { ok: false, error: '当前不能响应【铁骑】' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((p) => p.id === context.sourcePlayerId);
    const player = host.getState().players.find((p) => p.id === playerId);
    if (!card || !source || !player) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (context.awaitingTieqiSourceId === player.id) {
      const target = host
        .getState()
        .players.find((p) => p.id === context.awaitingTieqiTargetId);
      if (!target) {
        this.clearCardPlay(host);
        host.setPrompt(null);
        return { ok: false, error: '状态错误' };
      }

      if (choiceId === 'skip') {
        context.awaitingTieqiSourceId = undefined;
        context.awaitingTieqiTargetId = undefined;
        context.tieqiOfferedTargetIds = [
          ...(context.tieqiOfferedTargetIds ?? []),
          target.id,
        ];
        setCardPlayContext(host.getState().resolution.context, context);
        host.setPrompt(null);
        const targets = context.targetPlayerIds
          .map((id) => host.getState().players.find((p) => p.id === id))
          .filter((p): p is EnginePlayerState => !!p);
        return this.continueResolution(host, card, source, targets, context);
      }

      if (choiceId !== 'skill:tieqi') {
        return { ok: false, error: '无效选择' };
      }

      context.awaitingTieqiSourceId = undefined;
      context.awaitingTieqiTargetId = undefined;
      return this.resolveTieqiJudge(host, card, source, target, context);
    }

    if (choiceId === 'skip') {
      this.blockTieqiShan(context, player.id);
      host.log(`${player.generalName} 未弃置同花色牌，不能使用【闪】响应此【杀】`);
    } else if (choiceId.startsWith('tieqi:discard:')) {
      const handIndex = Number(choiceId.slice('tieqi:discard:'.length));
      const suit = context.tieqiJudgeSuits?.[player.id];
      const cardEntry = player.handCards[handIndex];
      if (!Number.isInteger(handIndex) || handIndex < 0 || !cardEntry) {
        return { ok: false, error: '所选手牌无效' };
      }
      if (!suit || suitOfCardEntry(cardEntry) !== suit) {
        return { ok: false, error: '请选择与【铁骑】判定结果同花色的手牌' };
      }
      player.handCards.splice(handIndex, 1);
      host.getDeck().discardCard(cardEntry);
      host.afterPlayerLostHandCards?.(player, 1);
      host.log(`${player.generalName} 弃置 ${cardEntry}，可以使用【闪】响应此【杀】`);
    } else {
      return { ok: false, error: '无效选择' };
    }

    context.awaitingTieqiFrom = undefined;
    setCardPlayContext(host.getState().resolution.context, context);
    host.setPrompt(null);
    const targets = context.targetPlayerIds
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);
    return this.continueResolution(host, card, source, targets, context);
  }

  submitFenwei(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
    zoneCardId?: string,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'fenwei' || playerId !== prompt.playerId) {
      return { ok: false, error: '当前不能响应【奋威】' };
    }

    const card = CardRegistry.getById(context.cardId);
    const source = host.getState().players.find((p) => p.id === context.sourcePlayerId);
    const player = host.getState().players.find((p) => p.id === playerId);
    if (!card || !source || !player) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId === 'skip') {
      host.setPrompt(null);
      const targets = context.targetPlayerIds
        .map((id) => host.getState().players.find((p) => p.id === id))
        .filter((p): p is EnginePlayerState => !!p);
      return this.continueResolution(host, card, source, targets, context);
    }

    if (choiceId !== 'skill:fenwei') {
      return { ok: false, error: '无效选择' };
    }

    const parsed = parseZoneCardId(zoneCardId ?? '');
    if (!parsed || parsed.zone === 'judge') {
      return { ok: false, error: '请选择一张手牌或装备弃置' };
    }

    const handCountBefore = player.handCards.length;
    const equipmentCountBefore = player.equipment.length;
    const discarded = discardZoneCard(player, parsed.zone, parsed.index, host.getDeck(), (message) =>
      host.log(message),
    );
    if (!discarded) return { ok: false, error: '所选牌无效' };
    host.afterPlayerLostHandCards?.(player, handCountBefore - player.handCards.length);
    host.afterPlayerLostEquipmentCards?.(
      player,
      equipmentCountBefore - player.equipment.length,
    );

    player.skillUseCount.fenwei = (player.skillUseCount.fenwei ?? 0) + 1;
    context.fenweiCancelledTargetIds = Array.from(
      new Set([...(context.fenweiCancelledTargetIds ?? []), player.id]),
    );
    setCardPlayContext(host.getState().resolution.context, context);
    host.log(`${player.generalName} 发动【奋威】，取消【${card.name}】对自己的影响`);
    host.setPrompt(null);

    const targets = context.targetPlayerIds
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);
    return this.continueResolution(host, card, source, targets, context);
  }

  private beginShaResponseAgainstTarget(
    host: CardPlayHost,
    source: EnginePlayerState,
    target: EnginePlayerState,
    shaCardEntry: string,
    context: CardPlayContext,
    logSuffix?: string,
  ): { ok: boolean; error?: string; paused?: boolean } {
    const shaCard = CardRegistry.getByName('杀');
    if (!shaCard) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    const suffix = logSuffix ? `（${logSuffix}）` : '';
    host.log(
      `${source.generalName} 对 ${target.generalName} 使用${formatHandEntryForLog(shaCardEntry)}${suffix}`,
    );

    if (shaBlockedByArmor(source, target, shaCardEntry)) {
      host.log(formatRenwangBlockedLog(target.generalName, shaCardEntry));
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }

    context.jiedaoActive = false;
    context.jiedaoHolderId = undefined;
    context.jiedaoVictimId = undefined;
    context.cardId = shaCard.id;
    context.sourcePlayerId = source.id;
    context.targetPlayerIds = [target.id];
    context.responseType = 'shan';
    context.responsesRequired = 1;
    context.responseCount = 0;
    context.awaitingResponseFrom = target.id;
    context.committedCardEntry = shaCardEntry;
    context.cardCommitted = true;
    setCardPlayContext(host.getState().resolution.context, context);

    const tieqiTarget = this.findTieqiTarget(shaCard, source, [target], context);
    if (tieqiTarget) {
      return this.promptTieqiOffer(host, shaCard, source, tieqiTarget, context);
    }

    return this.promptResponse(host, shaCard, source, target, context);
  }

  private findTieqiTarget(
    card: CardDefinition,
    source: EnginePlayerState,
    targets: EnginePlayerState[],
    context: CardPlayContext,
  ): EnginePlayerState | undefined {
    if (card.id !== 'sha' || !playerHasSkill(source, 'tieqi') || context.awaitingTieqiFrom) {
      return undefined;
    }
    const offered = new Set(context.tieqiOfferedTargetIds ?? []);
    return targets.find((target) => !offered.has(target.id) && target.hp > 0 && !target.dead);
  }

  private promptTieqiOffer(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    context.awaitingTieqiSourceId = source.id;
    context.awaitingTieqiTargetId = target.id;
    setCardPlayContext(host.getState().resolution.context, context);
    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: source.id,
      skillId: 'tieqi',
      skillName: '铁骑',
      sourcePlayerId: source.id,
      cardId: card.id,
      cardName: card.name,
      targetPlayerIds: [target.id],
      message: `${source.generalName}：是否对 ${target.generalName} 发动【铁骑】？`,
      options: [
        { id: 'skill:tieqi', label: '发动【铁骑】' },
        { id: 'skip', label: '不发动' },
      ],
    });
    return { ok: true, paused: true };
  }

  private resolveTieqiJudge(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    context.tieqiOfferedTargetIds = [...(context.tieqiOfferedTargetIds ?? []), target.id];
    const judgeCard = host.getDeck().drawOne();
    const targets = context.targetPlayerIds
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);
    if (!judgeCard) {
      setCardPlayContext(host.getState().resolution.context, context);
      return this.continueResolution(host, card, source, targets, context);
    }
    host.getDeck().discardCard(judgeCard);
    const judge = createCardInstance(judgeCard);
    target.skillUseCount._yijue_non_locked_disabled = 1;
    source.skillUseCount.tieqi = (source.skillUseCount.tieqi ?? 0) + 1;
    context.awaitingTieqiFrom = target.id;
    context.tieqiJudgeSuits = { ...(context.tieqiJudgeSuits ?? {}), [target.id]: judge.suit };

    const discardHandIndices = target.handCards
      .map((handCard, index) => (suitOfCardEntry(handCard) === judge.suit ? index : -1))
      .filter((index) => index >= 0);
    host.log(
      `${source.generalName} 发动【铁骑】，判定为 ${judgeCard}，${target.generalName} 本回合非锁定技失效`,
    );

    if (discardHandIndices.length === 0) {
      this.blockTieqiShan(context, target.id);
      context.awaitingTieqiFrom = undefined;
      setCardPlayContext(host.getState().resolution.context, context);
      host.log(`${target.generalName} 没有${judge.suit}花色手牌，不能使用【闪】响应此【杀】`);
      return this.continueResolution(host, card, source, targets, context);
    }

    setCardPlayContext(host.getState().resolution.context, context);
    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: target.id,
      skillId: 'tieqi',
      skillName: '铁骑',
      sourcePlayerId: source.id,
      cardId: card.id,
      cardName: card.name,
      targetPlayerIds: [target.id],
      discardCount: 1,
      discardHandIndices,
      message: `${target.generalName}：受到【铁骑】影响，可弃置一张${judge.suit}花色手牌，否则不能使用【闪】响应此【杀】。`,
      options: [
        ...discardHandIndices.map((index) => ({
          id: `tieqi:discard:${index}`,
          label: `弃置 ${target.handCards[index]}`,
        })),
        { id: 'skip', label: '不弃置' },
      ],
    });
    return { ok: true, paused: true };
  }

  private blockTieqiShan(context: CardPlayContext, targetId: string): void {
    context.tieqiBlockedTargetIds = Array.from(
      new Set([...(context.tieqiBlockedTargetIds ?? []), targetId]),
    );
  }

  private findQianxunTarget(
    card: CardDefinition,
    targets: EnginePlayerState[],
    context: CardPlayContext,
  ): EnginePlayerState | undefined {
    if (card.id !== 'lebusishu' && card.id !== 'shunshou_qianyang') return undefined;
    const cancelled = new Set(context.qianxunCancelledTargetIds ?? []);
    const offered = new Set(context.qianxunOfferedTargetIds ?? []);
    if (context.awaitingQianxunFrom) return undefined;
    return targets.find(
      (target) =>
        !cancelled.has(target.id) &&
        !offered.has(target.id) &&
        playerHasSkill(target, 'qianxun') &&
        target.handCards.length >= 2,
    );
  }

  private findFenweiTarget(
    card: CardDefinition,
    originalTargets: EnginePlayerState[],
    targets: EnginePlayerState[],
    context: CardPlayContext,
  ): EnginePlayerState | undefined {
    if (card.type !== 'trick' || originalTargets.length <= 1) return undefined;
    const offered = new Set(context.fenweiOfferedTargetIds ?? []);
    const cancelled = new Set(context.fenweiCancelledTargetIds ?? []);
    return targets.find(
      (target) =>
        !offered.has(target.id) &&
        !cancelled.has(target.id) &&
        playerHasSkill(target, 'fenwei') &&
        target.handCards.length + target.equipment.length > 0,
    );
  }

  private findLiuliTarget(
    host: CardPlayHost,
    source: EnginePlayerState,
    card: CardDefinition,
    targets: EnginePlayerState[],
    context: CardPlayContext,
  ): EnginePlayerState | undefined {
    if (card.id !== 'sha' || context.awaitingLiuliFrom) return undefined;
    const offered = new Set(context.liuliOfferedTargetIds ?? []);
    return targets.find((target) => {
      if (offered.has(target.id) || !playerHasSkill(target, 'liuli')) return false;
      if (target.handCards.length + target.equipment.length <= 0) return false;
      return host.getState().players.some(
        (player) =>
          player.id !== source.id &&
          player.id !== target.id &&
          player.hp > 0 &&
          !player.dead &&
          isInAttackRange(host.getState().players, target, player),
      );
    });
  }

  private canInitiateTao(source: EnginePlayerState, card: CardDefinition): boolean {
    return card.id !== 'tao' || source.hp < source.maxHp;
  }

  private collectWuxieQueue(host: CardPlayHost, sourcePlayerId: string): string[] {
    const players = [...host.getState().players].sort((left, right) => left.seat - right.seat);
    const sourceIndex = players.findIndex((player) => player.id === sourcePlayerId);
    if (sourceIndex < 0) return [];

    const ordered = [
      ...players.slice(sourceIndex),
      ...players.slice(0, sourceIndex),
    ];
    return ordered
      .filter((player) => validResponseCards('wuxie', player.handCards).length > 0)
      .map((player) => player.id);
  }

  private promptNextWuxie(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; paused?: boolean; scheduleAoe?: boolean } {
    const queue = context.wuxieQueue ?? [];
    while (queue.length > 0) {
      const responderId = queue.shift()!;
      const responder = host
        .getState()
        .players.find((player) => player.id === responderId);
      if (!responder || validResponseCards('wuxie', responder.handCards).length === 0) {
        continue;
      }

      context.awaitingWuxieFrom = responder.id;
      context.wuxiePromptSourcePlayerId = source.id;
      context.wuxieQueue = queue;
      setCardPlayContext(host.getState().resolution.context, context);

      const options = this.buildWuxieOptions(host, responder.id, context.targetPlayerIds);
      host.setPrompt({
        id: nextPromptId(),
        type: 'response',
        playerId: responder.id,
        sourcePlayerId: source.id,
        cardName: card.name,
        targetPlayerIds: context.targetPlayerIds,
        message: `${responder.generalName}：是否对【${card.name}】使用【无懈可击】？`,
        validResponseCards: ['无懈可击'],
        options: [...options, { id: 'pass', label: '不出' }],
      });
      return { ok: true, paused: true };
    }

    context.awaitingWuxieFrom = undefined;
    context.wuxiePromptSourcePlayerId = undefined;
    setCardPlayContext(host.getState().resolution.context, context);
    const targets = context.targetPlayerIds
      .map((id) => host.getState().players.find((player) => player.id === id))
      .filter((player): player is EnginePlayerState => !!player);
    return this.continueResolution(host, card, source, targets, context);
  }

  private buildWuxieOptions(
    host: CardPlayHost,
    responderId: string,
    targetPlayerIds: string[],
  ): NonNullable<GamePrompt['options']> {
    const targets = targetPlayerIds
      .map((id) => host.getState().players.find((player) => player.id === id))
      .filter((player): player is EnginePlayerState => !!player);

    const options: NonNullable<GamePrompt['options']> = [];
    if (targets.length > 1) {
      options.push({
        id: 'wuxie:all',
        label: '打出【无懈可击】给所有目标',
      });
    }
    for (const target of targets) {
      options.push({
        id: `wuxie:${target.id}`,
        label: `打出【无懈可击】给 ${target.generalName}`,
      });
    }
    if (targets.length === 1 && targets[0]?.id === responderId) {
      options[0] = {
        id: `wuxie:${targets[0].id}`,
        label: `打出【无懈可击】给自己`,
      };
    }
    return options;
  }

  private submitWuxieResponse(
    host: CardPlayHost,
    responder: EnginePlayerState,
    source: EnginePlayerState,
    card: CardDefinition,
    context: CardPlayContext,
    choiceId: string,
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    if (choiceId === 'pass') {
      context.awaitingWuxieFrom = undefined;
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt(null);
      return this.promptNextWuxie(host, card, source, context);
    }

    if (!choiceId.startsWith('wuxie:')) {
      return { ok: false, error: '无效选择' };
    }
    if (!removeCardFromHand(responder, '无懈可击')) {
      return { ok: false, error: '手牌中没有【无懈可击】' };
    }

    host.getDeck().discardCard('无懈可击');
    const targetKey = choiceId.slice('wuxie:'.length);
    context.awaitingWuxieFrom = undefined;

    if (targetKey === 'all') {
      context.wuxieCancelledAll = true;
      host.log(
        `${responder.generalName} 使用【无懈可击】抵消【${card.name}】对所有人的效果`,
      );
    } else {
      const target = host
        .getState()
        .players.find((player) => player.id === targetKey);
      context.wuxieCancelledTargetIds = [
        ...(context.wuxieCancelledTargetIds ?? []),
        targetKey,
      ];
      host.log(
        `${responder.generalName} 使用【无懈可击】抵消【${card.name}】对${target?.generalName ?? '目标'}的效果`,
      );
    }

    setCardPlayContext(host.getState().resolution.context, context);
    host.setPrompt(null);
    return this.promptNextWuxie(host, card, source, context);
  }

  private runImmediateEffects(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    targets: EnginePlayerState[],
  ): void {
    if (card.id === 'sha' && source.skillUseCount['_jiu_buff']) {
      source.skillUseCount['_jiu_buff'] = 0;
    }
    runCardEffects({
      source,
      targets,
      card,
      deck: host.getDeck(),
      log: (message) => host.log(message),
      onLostEquipment: (player, lostCount) =>
        host.afterPlayerLostEquipmentCards?.(player, lostCount),
    });
  }

  private applyDamageBuffs(
    source: EnginePlayerState,
    card: CardDefinition,
    amount: number,
  ): number {
    let nextAmount = amount;

    if (card.id === 'sha') {
      const jiuBonus = source.skillUseCount['_jiu_buff'] ?? 0;
      if (jiuBonus > 0) {
        nextAmount += jiuBonus;
        delete source.skillUseCount['_jiu_buff'];
      }
    }

    if ((card.id === 'sha' || card.id === 'juedou') && source.skillUseCount['_luoyi_damage_plus']) {
      nextAmount += 1;
    }

    return nextAmount;
  }

  private canUseShaThisTurn(source: EnginePlayerState, card: CardDefinition): boolean {
    if (card.id !== 'sha') return true;
    if (source.skillUseCount._allow_qinglong_sha) return true;
    const limit = card.defaultUsePerTurn ?? 1;
    const qinxueBonus = source.skillUseCount._qinxue_sha_bonus ?? 0;
    if (source.shaUsedCount < limit + qinxueBonus) return true;
    const hasCrossbow = source.equipment.some((equipment) => equipment.includes('诸葛连弩'));
    return hasCrossbow || playerHasSkill(source, 'paoxiao');
  }

  private targetMaxForCard(card: CardDefinition, source: EnginePlayerState): number {
    const baseMax = card.targeting.count?.max ?? 1;
    if (card.id !== 'sha') return baseMax;
    if (!hasEquipment(source, '方天画戟')) return baseMax;
    return source.handCards.length <= 1 ? Math.max(baseMax, 3) : baseMax;
  }

  private resolveZhangbaHandIndices(
    source: EnginePlayerState,
    requestedCardName: string,
    handIndex?: number,
  ): number[] | undefined {
    if (requestedCardName !== '杀') return undefined;
    if (!hasEquipment(source, '丈八蛇矛')) return undefined;
    if (source.handCards.length < 2) return undefined;
    const first = handIndex != null && handIndex >= 0 && handIndex < source.handCards.length ? handIndex : 0;
    const second = source.handCards.findIndex((_, index) => index !== first);
    if (second < 0) return undefined;
    const indices = [first, second].sort((left, right) => left - right);
    const firstEntry = source.handCards[indices[0]!]!;
    if (cardNameFromHandEntry(firstEntry) === '杀') return undefined;
    return indices;
  }

  private promptShaDodgedEquipment(
    host: CardPlayHost,
    source: EnginePlayerState,
    target: EnginePlayerState,
    context: CardPlayContext,
  ): boolean {
    const options: NonNullable<GamePrompt['options']> = [];
    const hasUnusedSha = source.handCards.some((entry) => cardNameFromHandEntry(entry) === '杀');
    if (hasEquipment(source, '青龙偃月刀') && hasUnusedSha) {
      options.push({ id: 'qinglong:sha', label: '发动【青龙偃月刀】' });
    }
    if (hasEquipment(source, '贯石斧') && zoneCardCount(source) >= 2) {
      options.push({ id: 'guanshi:force', label: '发动【贯石斧】' });
    }
    if (options.length === 0) return false;

    context.shaDodgedEquipment = { sourceId: source.id, targetId: target.id };
    setCardPlayContext(host.getState().resolution.context, context);
    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: source.id,
      skillId: 'sha_dodged_equipment',
      skillName: '武器追击',
      sourcePlayerId: source.id,
      cardId: 'sha',
      cardName: '杀',
      targetPlayerIds: [target.id],
      discardCount: hasEquipment(source, '贯石斧') ? 2 : undefined,
      skillCardOptions: listZoneCards(source, { hideHand: false, shuffleHand: false }),
      message: `${source.generalName}：【杀】被 ${target.generalName} 抵消，可发动武器效果。`,
      options: [...options, { id: 'skip', label: '不发动' }],
    });
    return true;
  }

  async submitShaDodgedEquipment(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
    zoneCardIds: string[] = [],
    onDamage: (params: {
      sourceId: string;
      targetId: string;
      amount: number;
      damageCardName?: string;
    }) => Promise<void>,
  ): Promise<{ ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean }> {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context?.shaDodgedEquipment) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'use_skill' || prompt.skillId !== 'sha_dodged_equipment' || prompt.playerId !== playerId) {
      return { ok: false, error: '当前不能发动武器效果' };
    }

    const source = host.getState().players.find((player) => player.id === context.shaDodgedEquipment?.sourceId);
    const target = host.getState().players.find((player) => player.id === context.shaDodgedEquipment?.targetId);
    const shaCard = CardRegistry.getByName('杀');
    if (!source || !target || !shaCard) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId === 'skip') {
      this.clearCardPlay(host);
      host.setPrompt(null);
      host.log('【杀】被抵消');
      return { ok: true };
    }

    if (choiceId === 'qinglong:sha') {
      const handIndex = source.handCards.findIndex((entry) => cardNameFromHandEntry(entry) === '杀');
      if (handIndex < 0) return { ok: false, error: '手牌中没有【杀】' };

      context.shaDodgedEquipment = undefined;
      context.cardId = shaCard.id;
      context.handIndex = handIndex;
      context.zhangbaHandIndices = undefined;
      context.targetPlayerIds = [target.id];
      context.responseType = 'shan';
      context.responsesRequired = 1;
      context.responseCount = 0;
      context.awaitingResponseFrom = target.id;
      context.cardCommitted = false;
      setCardPlayContext(host.getState().resolution.context, context);
      host.setPrompt(null);
      host.log(`${source.generalName} 发动【青龙偃月刀】，对 ${target.generalName} 再使用一张【杀】`);
      source.skillUseCount._allow_qinglong_sha = 1;
      this.commitPlayedCard(host, source, shaCard, context, [target]);
      delete source.skillUseCount._allow_qinglong_sha;
      return this.promptResponse(host, shaCard, source, target, context);
    }

    if (choiceId === 'guanshi:force') {
      if (zoneCardIds.length !== 2) return { ok: false, error: '请选择两张牌弃置' };
      const parsedCards = zoneCardIds.map(parseZoneCardId);
      if (parsedCards.some((parsed) => !parsed || parsed.zone === 'judge')) {
        return { ok: false, error: '请选择两张手牌或装备弃置' };
      }
      const unique = new Set(zoneCardIds);
      if (unique.size !== 2) return { ok: false, error: '不能重复选择同一张牌' };
      const handCountBefore = source.handCards.length;
      const equipmentCountBefore = source.equipment.length;
      for (const parsed of parsedCards.sort((left, right) => right!.index - left!.index)) {
        if (!discardZoneCard(source, parsed!.zone, parsed!.index, host.getDeck(), (message) => host.log(message))) {
          return { ok: false, error: '所选牌无效' };
        }
      }
      host.afterPlayerLostHandCards?.(source, handCountBefore - source.handCards.length);
      host.afterPlayerLostEquipmentCards?.(source, equipmentCountBefore - source.equipment.length);
      this.clearCardPlay(host);
      host.setPrompt(null);
      host.log(`${source.generalName} 发动【贯石斧】，弃置两张牌令【杀】强制命中 ${target.generalName}`);
      await onDamage({
        sourceId: source.id,
        targetId: target.id,
        amount: this.applyDamageBuffs(source, shaCard, 1),
        damageCardName: context.committedCardEntry ?? shaCard.name,
      });
      return { ok: true };
    }

    return { ok: false, error: '无效选择' };
  }

  private resolveVirtualInitiateCardName(
    source: EnginePlayerState,
    entry: string,
    requestedCardName: string,
  ): string | undefined {
    const actualName = cardNameFromHandEntry(entry);
    if (requestedCardName === actualName) return actualName;
    if (requestedCardName === '杀' && canUseAsSha(source, entry)) return '杀';
    if (requestedCardName === '过河拆桥' && canUseAsGuohe(source, entry)) return '过河拆桥';
    if (requestedCardName === '乐不思蜀' && canUseAsLebu(source, entry)) return '乐不思蜀';
    return undefined;
  }

  private resolveHandIndex(
    source: EnginePlayerState,
    cardName: string,
    handIndex?: number,
  ): number {
    const parsed = cardNameFromHandEntry(cardName);
    if (handIndex != null && handIndex >= 0 && handIndex < source.handCards.length) {
      return handIndex;
    }
    return source.handCards.findIndex((card) => cardNameFromHandEntry(card) === parsed);
  }

  private requireCardPlay(host: CardPlayHost): CardPlayContext | undefined {
    return host.getState().resolution.context.cardPlay as CardPlayContext | undefined;
  }

  private clearCardPlay(host: CardPlayHost): void {
    setCardPlayContext(host.getState().resolution.context, undefined);
  }

  private startWuguDistribution(
    host: CardPlayHost,
    source: EnginePlayerState,
    context: CardPlayContext,
  ): { ok: boolean; paused?: boolean } {
    const alive = host
      .getState()
      .players.filter((player) => player.hp > 0)
      .sort((a, b) => a.seat - b.seat);
    const revealCount = alive.length;
    const revealed = host.getDeck().drawMany(revealCount);
    if (revealed.length === 0) {
      host.log('牌堆已空，【五谷丰登】无牌可亮');
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }
    context.wuguRevealed = revealed;
    context.wuguPickerQueue = sortTargetsFromSource(host.getState().players, source, alive).map(
      (player) => player.id,
    );
    setCardPlayContext(host.getState().resolution.context, context);
    host.log(
      `【五谷丰登】亮出 ${revealed.length} 张牌：${revealed.map((card) => `【${card}】`).join(' ')}`,
    );
    return this.promptNextWuguPick(host, context);
  }

  private promptNextWuguPick(
    host: CardPlayHost,
    context: CardPlayContext,
  ): { ok: boolean; paused?: boolean } {
    const queue = context.wuguPickerQueue ?? [];
    const revealed = context.wuguRevealed ?? [];
    if (queue.length === 0 || revealed.length === 0) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      host.log('【五谷丰登】分配完毕');
      return { ok: true };
    }
    const pickerId = queue[0]!;
    const picker = host.getState().players.find((player) => player.id === pickerId);
    if (!picker || picker.hp <= 0) {
      context.wuguPickerQueue = queue.slice(1);
      setCardPlayContext(host.getState().resolution.context, context);
      return this.promptNextWuguPick(host, context);
    }
    host.setPrompt({
      id: nextPromptId(),
      type: 'pick_revealed',
      playerId: picker.id,
      cardName: '五谷丰登',
      message: `${picker.generalName}：请从亮出的牌中选择一张获得`,
      options: revealed.map((cardName, index) => ({
        id: `revealed:${index}`,
        label: `获得【${cardName}】`,
      })),
    });
    return { ok: true, paused: true };
  }

  submitPickRevealed(
    host: CardPlayHost,
    playerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string; paused?: boolean } {
    const prompt = host.getState().prompt;
    const context = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'pick_revealed' || prompt.playerId !== playerId) {
      return { ok: false, error: '当前不能选牌' };
    }
    const match = choiceId.match(/^revealed:(\d+)$/);
    if (!match) return { ok: false, error: '请选择一张亮出的牌' };
    const index = Number(match[1]);
    const revealed = context.wuguRevealed ?? [];
    if (index < 0 || index >= revealed.length) {
      return { ok: false, error: '所选牌无效' };
    }
    const picker = host.getState().players.find((player) => player.id === playerId);
    if (!picker) return { ok: false, error: '玩家不存在' };
    const picked = revealed.splice(index, 1)[0]!;
    picker.handCards.push(picked);
    host.afterPlayerGainedCards?.(picker, [picked]);
    host.log(`${picker.generalName} 从【五谷丰登】中获得【${picked}】`);
    context.wuguRevealed = revealed;
    context.wuguPickerQueue = (context.wuguPickerQueue ?? []).slice(1);
    setCardPlayContext(host.getState().resolution.context, context);
    return this.promptNextWuguPick(host, context);
  }

  private promptZoneCardPick(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    action: 'discard' | 'take',
  ): { ok: boolean; error?: string; paused?: boolean } {
    const options = listZoneCards(target);
    const filteredOptions =
      action === 'discard'
        ? options.filter((option) =>
            canDiscardZoneCard(source, target, option.zone, option.index),
          )
        : options;
    if (filteredOptions.length === 0) {
      const context = this.requireCardPlay(host);
      if (context) {
        this.commitPlayedCard(host, source, card, context, [target]);
      }
      host.log(`${target.generalName} 区域无牌，【${card.name}】无效`);
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }

    setZonePickContext(host.getState().resolution.context, {
      action,
      sourcePlayerId: source.id,
      targetPlayerId: target.id,
    });

    const verb = action === 'discard' ? '弃置' : '获得';
    const promptId = nextPromptId();
    host.setPrompt({
      id: promptId,
      type: 'select_zone_card',
      playerId: source.id,
      cardId: card.id,
      cardName: card.name,
      targetPlayerIds: [target.id],
      message: `【${card.name}】：请选择 ${target.generalName} 区域内一张牌（${verb}）`,
      zoneCardOptions: filteredOptions.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    });

    return { ok: true, paused: true };
  }
}
