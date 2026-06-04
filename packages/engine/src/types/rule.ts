import type { EffectDefinition } from './card';
import type { GameTiming } from './timing';
import type { EventPhase } from './event';

export type RuleSourceType = 'skill' | 'equipment' | 'card' | 'system';

export interface RuleSource {
  type: RuleSourceType;
  id: string;
}

/** 条件谓词：通过 ConditionRegistry 解析，不使用 eval */
export interface ConditionSpec {
  predicate: string;
  params?: Record<string, unknown>;
}

/**
 * 统一规则项：技能、装备被动、卡牌效果均注册为 Rule。
 * 引擎只认 RuleDefinition，不认武将 id。
 */
export interface RuleDefinition {
  id: string;
  source: RuleSource;
  timing: GameTiming;
  phase: EventPhase;
  priority: number;
  conditions?: ConditionSpec[];
  effects?: EffectDefinition[];
  /** 交互模式名（InteractionRegistry），非武将名 */
  handler?: string;
  handlerParams?: Record<string, unknown>;
}
