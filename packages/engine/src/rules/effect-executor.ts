import type { EffectDefinition } from '../types/card';
import { CardRegistry } from '../registry/card-registry';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameState } from '../state/game-state';
import type { GameEvent } from '../types/event';
import type { DeckPile } from '../engine/deck-pile';
import {
  createCardInstance,
  formatCardInstance,
  isBlack,
  isRed,
} from '../engine/card-instance';
import {
  discardOneFromZone,
  equipToSlot,
  takeOneFromZone,
} from '../engine/equipment-zone';
import { listZoneCards } from '../engine/zone-card-pick';
import { setZonePickContext } from '../resolution/card-play-context';
import { nextPromptId } from '../utils/prompt-id';

export interface EffectExecutionContext {
  state: GameState;
  event: GameEvent;
  source: EnginePlayerState;
  targets: EnginePlayerState[];
  log: (message: string) => void;
  deck?: DeckPile;
  setPrompt?: (prompt: GamePrompt | null) => void;
}

/**
 * 原子效果执行器：配置中的 effects[] 只映射到这里，不按卡牌 id 分支。
 */
export class EffectExecutor {
  runAll(effects: EffectDefinition[] | undefined, ctx: EffectExecutionContext): boolean {
    if (!effects?.length) return false;
    for (const effect of effects) {
      if (this.runOne(effect, ctx)) return true;
    }
    return false;
  }

  runOne(effect: EffectDefinition, ctx: EffectExecutionContext): boolean {
    switch (effect.action) {
      case 'draw':
        this.draw(ctx, effect);
        break;
      case 'recover':
        this.recover(ctx, effect);
        break;
      case 'damage':
        this.damage(ctx, effect);
        break;
      case 'discard':
        this.discard(ctx, effect);
        break;
      case 'judge':
        return this.judge(ctx, effect);
      case 'moveCard':
        this.moveCard(ctx, effect);
        break;
      case 'equip': {
        const cardId = ctx.event.payload.cardId as string | undefined;
        if (!cardId) break;
        const card = CardRegistry.getById(cardId);
        if (card) equipToSlot(ctx.source, card, ctx.deck, ctx.log);
        break;
      }
      case 'modifyRule':
        this.modifyRule(ctx, effect);
        break;
      default:
        ctx.log(`[effect] unhandled primitive: ${effect.action}`);
        return false;
    }
    return false;
  }

  private draw(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const count = (effect.params?.count as number) ?? 1;
    const all = effect.params?.all as boolean;
    const list = all
      ? ctx.targets.length
        ? ctx.targets
        : [ctx.source]
      : [ctx.source];
    for (const p of list) {
      const drawn = ctx.deck?.drawMany(count) ?? [];
      if (drawn.length > 0) {
        p.handCards.push(...drawn);
      }
      ctx.log(`${p.generalName} 摸 ${count} 张牌`);
    }
  }

  private recover(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const amount = (effect.params?.amount as number) ?? 1;
    const list = effect.params?.all
      ? ctx.targets
      : ctx.targets.length
        ? ctx.targets
        : [ctx.source];
    for (const p of list) {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + amount);
        ctx.log(`${p.generalName} 回复 ${amount} 点体力（${p.hp}/${p.maxHp}）`);
      }
    }
  }

  private damage(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const amount = (effect.params?.amount as number) ?? 1;
    for (const t of ctx.targets) {
      t.hp = Math.max(0, t.hp - amount);
      ctx.log(`${t.generalName} 受到 ${amount} 点伤害（${t.hp}/${t.maxHp}）`);
    }
  }

  private discard(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const count = (effect.params?.count as number) ?? 1;
    const zone = (effect.params?.zone as string) ?? 'hand';
    const z =
      zone === 'any' ? 'any' : zone === 'equipment' ? 'equipment' : 'hand';
    for (const t of ctx.targets) {
      for (let i = 0; i < count; i++) {
        if (!discardOneFromZone(t, z, ctx.deck, ctx.log)) break;
      }
    }
  }

  private judge(ctx: EffectExecutionContext, effect: EffectDefinition): boolean {
    if (effect.params?.placeInJudge) {
      const targets = ctx.targets.length ? ctx.targets : [ctx.source];
      const cardName = (ctx.event.payload.cardName as string | undefined) ?? '判定牌';
      for (const target of targets) {
        target.judgeCards.push(cardName);
        ctx.log(`${target.generalName} 的判定区置入【${cardName}】`);
      }
      return false;
    }

    const judgeName =
      ctx.deck?.drawOne() ??
      (ctx.event.payload.damageCardName as string | undefined) ??
      (ctx.event.payload.cardName as string | undefined) ??
      '判定';
    const result = createCardInstance(judgeName);
    ctx.log(`${ctx.source.generalName} 判定：${formatCardInstance(result)}`);
    ctx.deck?.discardCard(judgeName);

    const redAction = effect.params?.onRed as string | undefined;
    const blackAction = effect.params?.onBlack as string | undefined;
    const damageSourceId = ctx.event.payload.sourcePlayerId as string | undefined;
    const damageSource = damageSourceId
      ? ctx.state.players.find((player) => player.id === damageSourceId)
      : undefined;
    const followupTargets = damageSource ? [damageSource] : ctx.targets;

    if (isRed(result) && redAction) {
      this.runJudgeFollowup(redAction, ctx, followupTargets);
      return false;
    }

    if (isBlack(result) && blackAction) {
      return this.runJudgeFollowup(blackAction, ctx, followupTargets);
    }
    return false;
  }

  private runJudgeFollowup(
    action: string,
    ctx: EffectExecutionContext,
    targets: EnginePlayerState[],
  ): boolean {
    if (targets.length === 0) return false;
    switch (action) {
      case 'damage':
        this.damage(
          { ...ctx, targets },
          { action: 'damage', params: { amount: 1 } },
        );
        return false;
      case 'discard':
        this.discard(
          { ...ctx, targets },
          { action: 'discard', params: { count: 1, zone: 'any' } },
        );
        return false;
      case 'pickDiscard': {
        const target = targets[0];
        if (!target) return false;
        const options = listZoneCards(target, { hideHand: false, shuffleHand: false });
        if (options.length === 0) {
          ctx.log(`${ctx.source.generalName} 发动【刚烈】，${target.generalName} 区域无牌`);
          return false;
        }
        if (!ctx.setPrompt) {
          this.discard(
            { ...ctx, targets },
            { action: 'discard', params: { count: 1, zone: 'any' } },
          );
          return false;
        }
        setZonePickContext(ctx.state.resolution.context, {
          action: 'discard',
          sourcePlayerId: ctx.source.id,
          targetPlayerId: target.id,
        });
        ctx.setPrompt({
          id: nextPromptId(),
          type: 'select_zone_card',
          playerId: ctx.source.id,
          skillId: 'ganglie',
          skillName: '刚烈',
          targetPlayerIds: [target.id],
          message: `【刚烈】：请选择 ${target.generalName} 区域内一张牌弃置`,
          zoneCardOptions: options.map((option) => ({
            id: option.id,
            label: option.label,
          })),
        });
        return true;
      }
      default:
        ctx.log(`[effect] unhandled judge followup: ${action}`);
        return false;
    }
  }

  private moveCard(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const from = effect.params?.from as string | undefined;
    const count = (effect.params?.count as number) ?? 1;
    if (from === 'damageCard') {
      const name = ctx.event.payload.damageCardName as string | undefined;
      if (name) {
        ctx.source.handCards.push(name);
        ctx.log(`${ctx.source.generalName} 获得伤害牌【${name}】`);
      }
      return;
    }
    if (from === 'damageSource') {
      const srcId = ctx.event.payload.sourcePlayerId as string | undefined;
      const src = srcId ? ctx.state.players.find((p) => p.id === srcId) : undefined;
      if (src) {
        for (let i = 0; i < count; i++) {
          if (!takeOneFromZone(src, ctx.source, ctx.deck, ctx.log)) break;
        }
      }
      return;
    }
    if (from === 'judgeResult' || from === 'othersHand') {
      ctx.log(`[effect] moveCard.from=${from} requires interaction handler`);
      return;
    }
    for (const t of ctx.targets) {
      for (let i = 0; i < count; i++) {
        if (!takeOneFromZone(t, ctx.source, ctx.deck, ctx.log)) break;
      }
    }
  }

  private modifyRule(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    const rule = effect.params?.rule as string;
    const value = effect.params?.value as number | null | undefined;
    if (!rule) return;
    ctx.state.modifiers.push({
      id: `mod:${rule}:${ctx.source.id}:${Date.now()}`,
      sourceId: ctx.source.id,
      key: rule as 'shaPerTurn',
      value: value === undefined ? null : value,
    });
    ctx.log(`${ctx.source.generalName} 规则修正 ${rule}`);
  }
}
