import type { EffectDefinition } from '../types/card';
import { CardRegistry } from '../registry/card-registry';
import type { EnginePlayerState } from '../types/game';
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

export interface EffectExecutionContext {
  state: GameState;
  event: GameEvent;
  source: EnginePlayerState;
  targets: EnginePlayerState[];
  log: (message: string) => void;
  deck?: DeckPile;
}

/**
 * 原子效果执行器：配置中的 effects[] 只映射到这里，不按卡牌 id 分支。
 */
export class EffectExecutor {
  runAll(effects: EffectDefinition[] | undefined, ctx: EffectExecutionContext): void {
    if (!effects?.length) return;
    for (const effect of effects) {
      this.runOne(effect, ctx);
    }
  }

  runOne(effect: EffectDefinition, ctx: EffectExecutionContext): void {
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
        this.judge(ctx, effect);
        break;
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
        break;
    }
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

  private judge(ctx: EffectExecutionContext, effect: EffectDefinition): void {
    if (effect.params?.placeInJudge) {
      const targets = ctx.targets.length ? ctx.targets : [ctx.source];
      const cardName = (ctx.event.payload.cardName as string | undefined) ?? '判定牌';
      for (const target of targets) {
        target.judgeCards.push(cardName);
        ctx.log(`${target.generalName} 的判定区置入【${cardName}】`);
      }
      return;
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
      return;
    }

    if (isBlack(result) && blackAction) {
      this.runJudgeFollowup(blackAction, ctx, followupTargets);
    }
  }

  private runJudgeFollowup(
    action: string,
    ctx: EffectExecutionContext,
    targets: EnginePlayerState[],
  ): void {
    if (targets.length === 0) return;
    switch (action) {
      case 'damage':
        this.damage(
          { ...ctx, targets },
          { action: 'damage', params: { amount: 1 } },
        );
        break;
      case 'discard':
        this.discard(
          { ...ctx, targets },
          { action: 'discard', params: { count: 1, zone: 'any' } },
        );
        break;
      default:
        ctx.log(`[effect] unhandled judge followup: ${action}`);
        break;
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
