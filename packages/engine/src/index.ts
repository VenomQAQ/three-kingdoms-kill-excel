export * from './types/timing';
export * from './types/card';
export * from './types/skill';
export * from './types/game';
export { CardRegistry } from './registry/card-registry';
export { CharacterRegistry } from './registry/character-registry';
export { GameEngine } from './engine/game-engine';
export type { RoomPlayerInput } from './engine/game-engine';
export { EventManager } from './engine/event-manager';
export type { EventManagerHost, TimingEmitResult, TimingListener } from './engine/event-manager';
export { getValidTargets, needsTargetSelection, getAttackRange, sortAoeTargets } from './engine/targeting';
export { BASIC_CARDS } from './config/cards/basic';
export { TRICK_CARDS } from './config/cards/trick';
export { EQUIPMENT_CARDS } from './config/cards/equipment';
export { CHARACTERS } from './config/characters';
export { buildStandardDeck, createShuffledDeck } from './config/deck';
export { DeckPile } from './engine/deck-pile';

// —— 配置驱动核心引擎（推荐新功能使用） ——
export { SangokushiEngine } from './core/sangokushi-engine';
export type { SangokushiEngineOptions } from './core/sangokushi-engine';
export type { GameState, ResolutionState, TurnState } from './state/game-state';
export type { RuleModifier, RuleModifierKey } from './state/rule-modifiers';
export { ResolutionStack } from './resolution/resolution-stack';
export { TargetQueue } from './resolution/target-queue';
export {
  EventResolver,
  createUseCardEvent,
  createDamageEvent,
} from './resolution/event-resolver';
export type { ResolveResult } from './resolution/event-resolver';
export { CardPlayService } from './resolution/card-play-service';
export { resolveEventTiming } from './rules/event-timing-map';
export type { EventResolverHost } from './resolution/event-resolver';
export { TurnPhaseMachine } from './fsm/turn-phase-machine';
export { RuleManager } from './rules/rule-manager';
export type { RuleEmitContext } from './rules/rule-manager';
export { ConfigRuleLoader } from './rules/config-rule-loader';
export { ConditionRegistry } from './rules/condition-registry';
export type { ConditionContext } from './rules/condition-registry';
export { EffectExecutor } from './rules/effect-executor';
export type { EffectExecutionContext } from './rules/effect-executor';
export { InteractionRegistry } from './rules/interaction-registry';
export type { InteractionContext, InteractionHandler } from './rules/interaction-registry';
export { GameEventType, MAX_RESOLUTION_STACK_DEPTH } from './types/event';
export type { GameEvent, GameEventPayload, EventPhase } from './types/event';
export type { RuleDefinition, RuleSource, ConditionSpec } from './types/rule';
