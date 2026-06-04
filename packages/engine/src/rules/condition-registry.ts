import type { GameState } from '../state/game-state';
import type { ConditionSpec } from '../types/rule';
import type { GameEvent } from '../types/event';

export interface ConditionContext {
  state: GameState;
  event: GameEvent;
  /** 规则所属玩家 id（技能持有者） */
  ownerPlayerId?: string;
}

export type ConditionPredicate = (
  ctx: ConditionContext,
  params: Record<string, unknown>,
) => boolean;

/**
 * 条件谓词注册表 — 配置里只写 predicate id + params，禁止 eval。
 */
export class ConditionRegistry {
  private readonly predicates = new Map<string, ConditionPredicate>();

  register(id: string, fn: ConditionPredicate): void {
    this.predicates.set(id, fn);
  }

  registerDefaults(): void {
    this.register('always', () => true);
    this.register('eventNotCancelled', (ctx) => !ctx.event.cancelled);
    this.register('ownerIsSource', (ctx) => {
      if (!ctx.ownerPlayerId) return false;
      return ctx.event.payload.sourcePlayerId === ctx.ownerPlayerId;
    });
    this.register('ownerIsTarget', (ctx) => {
      if (!ctx.ownerPlayerId) return false;
      const targets = ctx.event.payload.targetPlayerIds ?? [];
      return targets.includes(ctx.ownerPlayerId);
    });
    this.register('hpAtMost', (ctx, params) => {
      const owner = ctx.state.players.find((p) => p.id === ctx.ownerPlayerId);
      const n = (params.n as number) ?? 0;
      return owner != null && owner.hp <= n;
    });
    this.register('skillUsesBelowLimit', (ctx, params) => {
      const owner = ctx.state.players.find((p) => p.id === ctx.ownerPlayerId);
      const skillId = params.skillId as string;
      const limit = (params.limit as number) ?? 1;
      if (!owner || !skillId) return false;
      return (owner.skillUseCount[skillId] ?? 0) < limit;
    });
  }

  checkAll(specs: ConditionSpec[] | undefined, ctx: ConditionContext): boolean {
    if (!specs?.length) return true;
    for (const spec of specs) {
      const fn = this.predicates.get(spec.predicate);
      if (!fn) {
        throw new Error(`Unknown condition predicate: ${spec.predicate}`);
      }
      if (!fn(ctx, spec.params ?? {})) return false;
    }
    return true;
  }
}
