import { CardRegistry } from '../registry/card-registry';
import type { CardDefinition } from '../types/card';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameState } from '../state/game-state';
import type { DeckPile } from '../engine/deck-pile';
import {
  getOnFailEffects,
  getResponseTypeFromEffect,
  isAoeCard,
  removeCardFromHand,
  runCardEffects,
  shaBlockedByArmor,
  validResponseCards,
} from '../engine/effect-runner';
import { validResponseCardsForPlayer } from '../engine/virtual-card';
import { cardNameFromHandEntry } from '../engine/card-label';
import {
  applyLockedModifiers,
  playerHasSkill,
  type TimingContext,
} from '../engine/timing-runner';
import {
  getValidTargets,
  needsTargetSelection,
  sortAoeTargets,
} from '../engine/targeting';
import { nextPromptId } from '../utils/prompt-id';
import {
  type CardPlayContext,
  getZonePickContext,
  setCardPlayContext,
  setZonePickContext,
} from './card-play-context';
import {
  discardZoneCard,
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
  scheduleAoeTargets?(sourcePlayerId: string, targetPlayerIds: string[]): void;
  completeTargetResolve?(): void;
  drainStack?(): Promise<{ paused: boolean }>;
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

    const card = CardRegistry.getByName(cardNameFromHandEntry(cardName));
    if (!card) return { ok: false, error: `未知卡牌：${cardName}` };
    if (card.canInitiate === false) {
      return { ok: false, error: '此牌不能主动打出' };
    }

    const index = this.resolveHandIndex(source, cardName, handIndex);
    if (index < 0) return { ok: false, error: '手牌中没有此牌' };

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
      const max = card.targeting.count?.max ?? 1;
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
      const max = card.targeting.count?.max ?? 1;
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
    const max = card?.targeting.count?.max ?? 1;
    if (targetIds.length < min || targetIds.length > max) {
      return {
        ok: false,
        error: `请选择 ${min}${max > min ? `~${max}` : ''} 个目标`,
      };
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

    const zonePickAction = getZonePickAction(card);
    if (!zonePickAction) {
      this.commitPlayedCard(host, source, card, context, targets);
    }

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

    const validCards = validResponseCardsForPlayer(target, responseType, target.handCards);
    const label = responseType === 'shan' ? '闪' : '杀';
    const required = context.responsesRequired;
    const count = context.responseCount;
    const hint =
      required > 1 ? `（需 ${required} 张【${label}】，已 ${count}/${required}）` : '';

    const duelActive = context.duelActive === true;
    const message = duelActive
      ? `${target.generalName}：请打出【${label}】继续决斗（不出则受到 1 点伤害）`
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

    const required = context.responsesRequired;
    const aoeActive = context.isAoe === true;
    const duelActive = context.duelActive === true;

    if (choiceId.startsWith('card:')) {
      const cardName = choiceId.slice(5);
      if (!removeCardFromHand(responder, cardName)) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      host.getDeck().discardCard(cardName);

      // 决斗：出【杀】后切换到另一方继续出【杀】
      if (duelActive) {
        host.log(`${responder.generalName} 打出【${cardName}】(1/1)`);
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
        `${responder.generalName} 打出【${cardName}】（${context.responseCount}/${required}）`,
      );
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

    if (choiceId === 'pass') {
      host.log(`${responder.generalName} 未响应【${card.name}】`);
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
          damageCardName: card.name,
        });
        return { ok: true, paused: host.getState().prompt != null };
      }

      if (aoeActive) {
        host.completeTargetResolve?.();
        await onDamage({
          sourceId: source.id,
          targetId: responder.id,
          amount,
          damageCardName: card.name,
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
        damageCardName: card.name,
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

  private commitPlayedCard(
    host: CardPlayHost,
    source: EnginePlayerState,
    card: CardDefinition,
    context: CardPlayContext,
    targets: EnginePlayerState[],
  ): void {
    if (context.cardCommitted) return;

    removeCardFromHand(source, card.name, context.handIndex);
    host.getDeck().discardCard(card.name);
    if (card.id === 'sha') source.shaUsedCount += 1;

    const targetLabel =
      targets.map((target) => target.generalName).join('、') || '全场';
    host.log(`${source.generalName} 对 ${targetLabel} 使用【${card.name}】`);

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

    const ok =
      zonePick.action === 'discard'
        ? discardZoneCard(target, parsed.zone, parsed.index, host.getDeck(), (message) =>
            host.log(message),
          )
        : takeZoneCard(target, source, parsed.zone, parsed.index, (message) =>
            host.log(message),
          );

    if (!ok) return { ok: false, error: '所选牌无效' };

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
      host.log(`【${card.name}】被【无懈可击】抵消`);
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
    }

    const cancelledTargets = new Set(context.wuxieCancelledTargetIds ?? []);
    const finalTargets = targets.filter((target) => !cancelledTargets.has(target.id));
    context.targetPlayerIds = finalTargets.map((target) => target.id);

    if (finalTargets.length === 0 && targets.length > 0) {
      this.commitPlayedCard(host, source, card, context, targets);
      host.log(`【${card.name}】的目标全部被【无懈可击】抵消`);
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: true };
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
      host.setPrompt(null);
      host.scheduleAoeTargets(source.id, context.targetPlayerIds);
      return { ok: true, scheduleAoe: true };
    }

    if (responseType && finalTargets.length > 0) {
      const target = finalTargets[0]!;
      if (card.id === 'sha' && shaBlockedByArmor(source, target)) {
        host.log(`【仁王盾】生效，【杀】对 ${target.generalName} 无效`);
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
          const ok =
            zonePickAction === 'discard'
              ? discardZoneCard(finalTargets[0]!, parsed.zone, parsed.index, host.getDeck(), (message) =>
                  host.log(message),
                )
              : takeZoneCard(finalTargets[0]!, source, parsed.zone, parsed.index, (message) =>
                  host.log(message),
                );

          if (ok) {
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
      host.log(`${responder.generalName} 打出【无懈可击】，抵消【${card.name}】对所有人的效果`);
    } else {
      const target = host
        .getState()
        .players.find((player) => player.id === targetKey);
      context.wuxieCancelledTargetIds = [
        ...(context.wuxieCancelledTargetIds ?? []),
        targetKey,
      ];
      host.log(
        `${responder.generalName} 打出【无懈可击】，抵消【${card.name}】对 ${target?.generalName ?? '目标'} 的效果`,
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
    const limit = card.defaultUsePerTurn ?? 1;
    if (source.shaUsedCount < limit) return true;
    const hasCrossbow = source.equipment.some((equipment) => equipment.includes('诸葛连弩'));
    return hasCrossbow || playerHasSkill(source, 'paoxiao');
  }

  private resolveHandIndex(
    source: EnginePlayerState,
    cardName: string,
    handIndex?: number,
  ): number {
    const parsed = cardNameFromHandEntry(cardName);
    if (
      handIndex != null &&
      handIndex >= 0 &&
      handIndex < source.handCards.length &&
      cardNameFromHandEntry(source.handCards[handIndex]!) === parsed
    ) {
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

  private promptZoneCardPick(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    action: 'discard' | 'take',
  ): { ok: boolean; error?: string; paused?: boolean } {
    const options = listZoneCards(target);
    if (options.length === 0) {
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
      zoneCardOptions: options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    });

    return { ok: true, paused: true };
  }
}
