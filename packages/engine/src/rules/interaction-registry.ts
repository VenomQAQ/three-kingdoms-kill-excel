import type { GameState } from '../state/game-state';
import type { RuleDefinition } from '../types/rule';
import type { GameEvent } from '../types/event';

export interface InteractionContext {
  state: GameState;
  event: GameEvent;
  rule: RuleDefinition;
  ownerPlayerId: string;
  log: (message: string) => void;
}

export type InteractionHandler = (ctx: InteractionContext) => Promise<void> | void;

/**
 * 交互模式注册表：按 handler 名复用，不按武将 id 分支。
 * 多步 UI 的 Handler 通过返回 paused 状态由引擎设置 prompt（后续接 EffectExecutorHost）。
 */
export class InteractionRegistry {
  private readonly handlers = new Map<string, InteractionHandler>();

  register(name: string, handler: InteractionHandler): void {
    this.handlers.set(name, handler);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  async run(
    name: string,
    ctx: InteractionContext,
  ): Promise<{ ok: boolean; error?: string }> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return { ok: false, error: `Unknown interaction handler: ${name}` };
    }
    await handler(ctx);
    return { ok: true };
  }

  /** 占位：设计阶段注册名，实现阶段补逻辑 */
  registerStubHandlers(): void {
    const stubNames = [
      'stealHands',
      'revealAndTake',
      'judgeLoop',
      'giveAndChoose',
      'distributeCards',
      'modifyJudge',
    ];
    for (const name of stubNames) {
      this.register(name, (ctx) => {
        ctx.log(
          `[stub] interaction "${name}" for rule ${ctx.rule.id} (configure effects or implement handler)`,
        );
      });
    }
  }
}
