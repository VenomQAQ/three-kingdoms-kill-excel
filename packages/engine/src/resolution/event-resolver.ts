import type { GameState } from '../state/game-state';
import { type GameEvent, GameEventType } from '../types/event';
import type { RuleManager } from '../rules/rule-manager';
import type { DeckPile } from '../engine/deck-pile';
import type { GamePrompt } from '../types/game';
import { GameTiming } from '../types/timing';
import { EffectExecutor } from '../rules/effect-executor';

export interface EventResolverHost {
  getState(): GameState;
  log(message: string): void;
  getDeck(): DeckPile | undefined;
  setPrompt?(prompt: GamePrompt | null): void;
  onExecuteCore?(event: GameEvent): Promise<void>;
}

export interface ResolveResult {
  paused: boolean;
  /** execute 已完成；post 阶段暂停时也应出栈，避免重复扣血 */
  executeFinished?: boolean;
}

/**
 * 统一结算管道：pre → on → execute → post。
 */
export class EventResolver {
  constructor(
    private readonly rules: RuleManager,
    private readonly effects = new EffectExecutor(),
  ) {}

  async resolve(host: EventResolverHost, event: GameEvent): Promise<ResolveResult> {
    const state = host.getState();
    state.resolution.currentEventId = event.id;

    let r = await this.emitPhase(host, event, 'pre');
    if (event.cancelled || r.paused) return r;

    r = await this.emitPhase(host, event, 'on');
    if (event.cancelled || r.paused) return r;

    if (host.onExecuteCore) {
      await host.onExecuteCore(event);
    } else {
      await this.defaultExecuteCore(host, event);
    }

    // AOE 响应等在 execute 阶段弹出 prompt，事件留栈待响应完成后再出栈。
    if (host.getState().prompt) {
      return {
        paused: true,
        executeFinished: event.type === GameEventType.DYING,
      };
    }

    r = await this.emitPhase(host, event, 'post');
    return { paused: r.paused, executeFinished: true };
  }

  private async emitPhase(
    host: EventResolverHost,
    event: GameEvent,
    phase: 'pre' | 'on' | 'post',
  ): Promise<ResolveResult> {
    const baseCtx = {
      state: host.getState(),
      event,
      phase,
      log: (m: string) => host.log(m),
      deck: host.getDeck(),
      setPrompt: host.setPrompt,
    };

    if (event.type === GameEventType.TAKE_DAMAGE && phase === 'post') {
      const victimId = event.payload.targetPlayerIds?.[0];
      return this.rules.emitForPlayersWithSkills(
        { ...baseCtx, ownerPlayerId: victimId },
        GameTiming.AFTER_DAMAGE,
      );
    }

    const ownerId =
      phase === 'post' && event.type === GameEventType.TAKE_DAMAGE
        ? event.payload.targetPlayerIds?.[0]
        : event.payload.sourcePlayerId;

    const paused = await this.rules.emit({ ...baseCtx, ownerPlayerId: ownerId });
    return paused;
  }

  private async defaultExecuteCore(
    host: EventResolverHost,
    event: GameEvent,
  ): Promise<void> {
    const state = host.getState();
    const sourceId = event.payload.sourcePlayerId;
    const source = sourceId ? state.players.find((p) => p.id === sourceId) : undefined;
    if (!source && event.type !== GameEventType.DYING) return;

    const targetIds = event.payload.targetPlayerIds ?? [];
    const targets = state.players.filter((p) => targetIds.includes(p.id));

    switch (event.type) {
      case GameEventType.TAKE_DAMAGE: {
        const amount = event.payload.amount ?? 1;
        const victim = targets[0];
        if (!victim || !source) return;
        this.effects.runOne(
          { action: 'damage', params: { amount } },
          {
            state,
            event,
            source,
            targets: [victim],
            log: (m) => host.log(m),
            deck: host.getDeck(),
          },
        );
        if (victim.hp <= 0) {
          host.log(`${victim.generalName} 进入濒死`);
        }
        break;
      }
      case GameEventType.DYING:
        host.log(`[${event.type}] 濒死结算（扩展 DYING 规则）`);
        break;
      default:
        break;
    }
  }
}

export function createUseCardEvent(params: {
  id: string;
  sourcePlayerId: string;
  targetPlayerIds: string[];
  cardId: string;
  cardName?: string;
}): GameEvent {
  return {
    id: params.id,
    type: GameEventType.USE_CARD,
    payload: {
      sourcePlayerId: params.sourcePlayerId,
      targetPlayerIds: params.targetPlayerIds,
      cardId: params.cardId,
      cardName: params.cardName,
    },
  };
}

export function createDamageEvent(params: {
  id: string;
  sourcePlayerId: string;
  targetPlayerId: string;
  amount?: number;
  damageCardName?: string;
}): GameEvent {
  return {
    id: params.id,
    type: GameEventType.TAKE_DAMAGE,
    payload: {
      sourcePlayerId: params.sourcePlayerId,
      targetPlayerIds: [params.targetPlayerId],
      amount: params.amount ?? 1,
      damageCardName: params.damageCardName,
    },
  };
}
