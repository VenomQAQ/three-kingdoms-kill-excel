import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameEvent } from '../types/event';
import type { TurnPhase } from '../types/timing';
import type { RuleModifier } from './rule-modifiers';

export interface DeckState {
  remaining: number;
  /** 服务端权威；客户端快照可不含具体顺序 */
  pile?: string[];
}

export interface ResolutionState {
  stack: GameEvent[];
  targetQueue: string[] | null;
  /** 当前正在结算的事件 id */
  currentEventId: string | null;
  context: Record<string, unknown>;
}

export interface TurnState {
  index: number;
  round: number;
  phase: TurnPhase;
}

/**
 * 纯数据层：唯一真相源。
 * 所有结算逻辑在 Resolution / Rule 层，不在此文件。
 */
export interface GameState {
  turn: TurnState;
  players: EnginePlayerState[];
  deck: DeckState;
  discardPile: string[];
  prompt: GamePrompt | null;
  resolution: ResolutionState;
  modifiers: RuleModifier[];
  log: string[];
  victory?: { winners: string[]; message: string } | null;
  lastDamageSourceId?: string | null;
}

export function createEmptyResolution(): ResolutionState {
  return {
    stack: [],
    targetQueue: null,
    currentEventId: null,
    context: {},
  };
}

export function createInitialGameState(
  players: EnginePlayerState[],
  deckRemaining: number,
): GameState {
  return {
    turn: { index: 0, round: 1, phase: 'judge' },
    players,
    deck: { remaining: deckRemaining },
    discardPile: [],
    prompt: null,
    resolution: createEmptyResolution(),
    modifiers: [],
    log: [],
  };
}

export function snapshotState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
