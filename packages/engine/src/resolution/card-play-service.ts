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
import { cardNameFromHandEntry } from '../engine/card-label';
import { applyLockedModifiers, playerHasSkill, type TimingContext } from '../engine/timing-runner';
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

/**
 * 配置驱动的用牌流程（杀/闪等）：读 CardDefinition.effects，不写 cardId 分支。
 */
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
    const source = host.getState().players.find((p) => p.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }

    const card = CardRegistry.getByName(cardNameFromHandEntry(cardName));
    if (!card) return { ok: false, error: `未知卡牌：${cardName}` };
    if (card.canInitiate === false) {
      return { ok: false, error: '此牌不能主动打出' };
    }

    const idx = this.resolveHandIndex(source, cardName, handIndex);
    if (idx < 0) return { ok: false, error: '手牌中没有此牌' };

    if (!this.canUseShaThisTurn(source, card)) {
      return { ok: false, error: '本回合【杀】已用完' };
    }

    setCardPlayContext(host.getState().resolution.context, {
      cardId: card.id,
      sourcePlayerId: sourceId,
      handIndex: idx,
      targetPlayerIds: [],
      responsesRequired: 1,
      responseCount: 0,
    });

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
    const ctx = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !ctx) {
      return { ok: false, error: '提示已失效' };
    }

    const card = CardRegistry.getById(ctx.cardId);
    const source = host.getState().players.find((p) => p.id === sourceId);
    if (!card || !source) return { ok: false, error: '状态错误' };

    if (needsTargetSelection(card)) {
      const valid = getValidTargets(card, source, host.getState().players);
      if (valid.length === 0) {
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
        message: `请选择【${card.name}】的目标（${card.targeting.count?.min ?? 1}～${max} 名）`,
        validTargetIds: valid.map((t) => t.id),
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
  ): { ok: boolean; error?: string; scheduleAoe?: boolean } {
    const prompt = host.getState().prompt;
    const ctx = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !ctx) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'select_targets') {
      return { ok: false, error: '当前不是选目标阶段' };
    }
    const valid = new Set(prompt.validTargetIds ?? []);
    for (const id of targetIds) {
      if (!valid.has(id)) return { ok: false, error: '目标不合法' };
    }
    const card = CardRegistry.getById(ctx.cardId);
    const min = card?.targeting.count?.min ?? 1;
    const max = card?.targeting.count?.max ?? 1;
    if (targetIds.length < min || targetIds.length > max) {
      return { ok: false, error: `请选择 ${min}${max > min ? `～${max}` : ''} 个目标` };
    }
    return this.startResolution(host, sourceId, targetIds);
  }

  /** 进入响应或直结；需要响应时设置 prompt 并返回 paused */
  startResolution(
    host: CardPlayHost,
    sourceId: string,
    targetIds: string[],
  ): { ok: boolean; error?: string; paused?: boolean; scheduleAoe?: boolean } {
    const ctx = this.requireCardPlay(host);
    if (!ctx) return { ok: false, error: '无进行中的用牌' };

    const card = CardRegistry.getById(ctx.cardId);
    const source = host.getState().players.find((p) => p.id === sourceId);
    if (!card || !source) {
      this.clearCardPlay(host);
      return { ok: false, error: '结算失败' };
    }

    removeCardFromHand(source, card.name, ctx.handIndex);
    host.getDeck().discardCard(card.name);
    if (card.id === 'sha') source.shaUsedCount += 1;

    let targets = targetIds
      .map((id) => host.getState().players.find((p) => p.id === id))
      .filter((p): p is EnginePlayerState => !!p);

    if (targets.length === 0 && card.targeting.selector === 'self') {
      targets = [source];
    }
    if (
      targets.length === 0 &&
      (card.targeting.selector === 'allOthers' || card.targeting.selector === 'all')
    ) {
      targets = getValidTargets(card, source, host.getState().players);
    }

    ctx.targetPlayerIds = targets.map((t) => t.id);
    host.log(
      `${source.generalName} 对 ${targets.map((t) => t.generalName).join('、') || '全场'} 使用【${card.name}】`,
    );

    const responseType = getResponseTypeFromEffect(card);
    if (responseType && isAoeCard(card) && targets.length > 0 && host.scheduleAoeTargets) {
      const sorted = sortAoeTargets(host.getState().players, source, targets);
      ctx.targetPlayerIds = sorted.map((t) => t.id);
      ctx.responseType = responseType;
      ctx.responsesRequired = 1;
      ctx.responseCount = 0;
      const timingCtx: TimingContext = { source, card, responsesRequired: 1 };
      applyLockedModifiers(timingCtx);
      ctx.responsesRequired = timingCtx.responsesRequired ?? 1;
      setCardPlayContext(host.getState().resolution.context, ctx);
      host.setPrompt(null);
      host.scheduleAoeTargets(source.id, ctx.targetPlayerIds);
      return { ok: true, scheduleAoe: true };
    }

    if (responseType && targets.length > 0) {
      const target = targets[0]!;
      if (card.id === 'sha' && shaBlockedByArmor(source, target)) {
        host.log(`【仁王盾】生效，【杀】对 ${target.generalName} 无效`);
        this.clearCardPlay(host);
        host.setPrompt(null);
        return { ok: true };
      }

      const timingCtx: TimingContext = { source, targets, card, responsesRequired: 1 };
      applyLockedModifiers(timingCtx);
      ctx.responsesRequired = timingCtx.responsesRequired ?? 1;
      ctx.responseType = responseType;
      ctx.responseCount = 0;
      ctx.awaitingResponseFrom = target.id;
      setCardPlayContext(host.getState().resolution.context, ctx);
      return this.promptResponse(host, card, source, target, ctx);
    }

    const zonePick = this.getZonePickAction(card);
    if (zonePick && targets.length > 0) {
      return this.promptZoneCardPick(host, card, source, targets[0]!, zonePick);
    }

    this.runImmediateEffects(host, card, source, targets);
    this.clearCardPlay(host);
    host.setPrompt(null);
    return { ok: true };
  }

  /** TARGET_RESOLVE 入栈后：对当前目标弹出与【杀】相同的响应 prompt */
  resolveTargetResponse(host: CardPlayHost, targetId: string): void {
    const ctx = this.requireCardPlay(host);
    if (!ctx) return;

    const card = CardRegistry.getById(ctx.cardId);
    const source = host.getState().players.find((p) => p.id === ctx.sourcePlayerId);
    const target = host.getState().players.find((p) => p.id === targetId);
    if (!card || !source || !target) return;

    if (target.hp <= 0) {
      host.log(`${target.generalName} 已阵亡，跳过【${card.name}】响应`);
      return;
    }

    ctx.awaitingResponseFrom = targetId;
    ctx.responseCount = 0;
    setCardPlayContext(host.getState().resolution.context, ctx);
    this.promptResponse(host, card, source, target, ctx);
  }

  promptResponse(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    target: EnginePlayerState,
    ctx: CardPlayContext,
  ): { ok: boolean; paused: boolean } {
    const responseType = ctx.responseType ?? getResponseTypeFromEffect(card);
    if (!responseType) {
      host.setPrompt(null);
      return { ok: true, paused: false };
    }

    const validCards = validResponseCards(responseType, target.handCards);
    const label = responseType === 'shan' ? '闪' : '杀';
    const required = ctx.responsesRequired;
    const count = ctx.responseCount;
    const hint =
      required > 1 ? `（需 ${required} 张【${label}】，已 ${count}/${required}）` : '';

    host.setPrompt({
      id: nextPromptId(),
      type: 'response',
      playerId: target.id,
      sourcePlayerId: source.id,
      cardName: card.name,
      message: `${target.generalName}：请打出【${label}】响应【${card.name}】${hint}`,
      validResponseCards: validCards,
      targetPlayerIds: ctx.targetPlayerIds,
      options: [
        ...validCards.map((c) => ({ id: `card:${c}`, label: `打出【${c}】` })),
        { id: 'pass', label: '不出（承受效果）' },
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
    const ctx = this.requireCardPlay(host);
    if (!prompt || prompt.id !== promptId || !ctx) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'response' || prompt.playerId !== responderId) {
      return { ok: false, error: '当前不能由你响应' };
    }

    const card = CardRegistry.getById(ctx.cardId);
    const source = host.getState().players.find((p) => p.id === ctx.sourcePlayerId);
    const target = host.getState().players.find((p) => p.id === responderId);
    if (!card || !source || !target) {
      this.clearCardPlay(host);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    const required = ctx.responsesRequired;

    const aoeActive = this.isAoeActive(host);

    if (choiceId.startsWith('card:')) {
      const cardName = choiceId.slice(5);
      if (!removeCardFromHand(target, cardName)) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      host.getDeck().discardCard(cardName);
      ctx.responseCount += 1;
      host.log(
        `${target.generalName} 打出【${cardName}】（${ctx.responseCount}/${required}）`,
      );
      setCardPlayContext(host.getState().resolution.context, ctx);
      if (ctx.responseCount < required) {
        return this.promptResponse(host, card, source, target, ctx);
      }
      host.setPrompt(null);
      if (aoeActive) {
        host.log(`【${card.name}】对 ${target.generalName} 被抵消`);
        host.completeTargetResolve?.();
        await host.drainStack?.();
        if (!this.isAoeActive(host)) this.clearCardPlay(host);
        return { ok: true, paused: host.getState().prompt != null };
      }
      this.clearCardPlay(host);
      host.log(`【${card.name}】被抵消`);
      return { ok: true };
    }

    if (choiceId === 'pass') {
      host.log(`${target.generalName} 未响应【${card.name}】`);
      const onFail = getOnFailEffects(card);
      const damageEffect = onFail.find((e) => e.action === 'damage');
      const amount = (damageEffect?.params?.amount as number) ?? 1;

      host.setPrompt(null);

      if (aoeActive) {
        await onDamage({
          sourceId: source.id,
          targetId: target.id,
          amount,
          damageCardName: card.name,
        });
        if (host.getState().prompt) {
          ctx.pendingAoeAdvance = true;
          setCardPlayContext(host.getState().resolution.context, ctx);
          return { ok: true, paused: true };
        }
        host.completeTargetResolve?.();
        await host.drainStack?.();
        if (!this.isAoeActive(host)) {
          this.clearCardPlay(host);
          host.log('锦囊/AOE 响应结算完毕');
        }
        return { ok: true, paused: false };
      }

      this.clearCardPlay(host);

      await onDamage({
        sourceId: source.id,
        targetId: target.id,
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

  submitZoneCardSelection(
    host: CardPlayHost,
    sourceId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const prompt = host.getState().prompt;
    const pick = getZonePickContext(host.getState().resolution.context);
    if (!prompt || prompt.id !== promptId || !pick) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'select_zone_card' || prompt.playerId !== sourceId) {
      return { ok: false, error: '当前不能选牌' };
    }

    const parsed = parseZoneCardId(choiceId);
    if (!parsed) return { ok: false, error: '请选择一张牌' };

    const source = host.getState().players.find((p) => p.id === pick.sourcePlayerId);
    const target = host.getState().players.find((p) => p.id === pick.targetPlayerId);
    if (!source || !target) {
      this.clearCardPlay(host);
      setZonePickContext(host.getState().resolution.context, undefined);
      host.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    const deck = host.getDeck();
    const log = (m: string) => host.log(m);
    const ok =
      pick.action === 'discard'
        ? discardZoneCard(target, parsed.zone, parsed.index, deck, log)
        : takeZoneCard(target, source, parsed.zone, parsed.index, log);

    if (!ok) return { ok: false, error: '所选牌无效' };

    this.clearCardPlay(host);
    setZonePickContext(host.getState().resolution.context, undefined);
    host.setPrompt(null);
    return { ok: true };
  }

  /** reactive 技能处理完后，推进 AOE 目标队列 */
  async advanceAoeIfPending(host: CardPlayHost): Promise<void> {
    const ctx = this.requireCardPlay(host);
    if (!ctx?.pendingAoeAdvance || host.getState().prompt) return;
    ctx.pendingAoeAdvance = false;
    setCardPlayContext(host.getState().resolution.context, ctx);
    host.completeTargetResolve?.();
    await host.drainStack?.();
    if (!this.isAoeActive(host)) {
      this.clearCardPlay(host);
      host.log('锦囊/AOE 响应结算完毕');
    }
  }

  private runImmediateEffects(
    host: CardPlayHost,
    card: CardDefinition,
    source: EnginePlayerState,
    targets: EnginePlayerState[],
  ): void {
    runCardEffects({
      source,
      targets,
      card,
      deck: host.getDeck(),
      log: (m) => host.log(m),
    });
  }

  private canUseShaThisTurn(source: EnginePlayerState, card: CardDefinition): boolean {
    if (card.id !== 'sha') return true;
    const limit = card.defaultUsePerTurn ?? 1;
    if (source.shaUsedCount < limit) return true;
    const hasCrossbow = source.equipment.some((e) => e.includes('诸葛连弩'));
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
    return source.handCards.findIndex(
      (c) => cardNameFromHandEntry(c) === parsed,
    );
  }

  private requireCardPlay(host: CardPlayHost): CardPlayContext | undefined {
    return host.getState().resolution.context.cardPlay as CardPlayContext | undefined;
  }

  private clearCardPlay(host: CardPlayHost): void {
    setCardPlayContext(host.getState().resolution.context, undefined);
  }

  private isAoeActive(host: CardPlayHost): boolean {
    return host.getState().resolution.targetQueue != null;
  }

  /** 配置：需玩家选择目标区域内一张牌 */
  private getZonePickAction(card: CardDefinition): 'discard' | 'take' | null {
    for (const e of card.effects) {
      if (e.action === 'discard' && e.params?.zone === 'any') return 'discard';
      if (e.action === 'moveCard' && !e.params?.from) return 'take';
    }
    return null;
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
    host.setPrompt({
      id: nextPromptId(),
      type: 'select_zone_card',
      playerId: source.id,
      cardId: card.id,
      cardName: card.name,
      targetPlayerIds: [target.id],
      message: `【${card.name}】：请选择 ${target.generalName} 区域内一张牌（${verb}）`,
      zoneCardOptions: options.map((o) => ({ id: o.id, label: o.label })),
    });
    return { ok: true, paused: true };
  }
}
