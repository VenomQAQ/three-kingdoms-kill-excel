import type { EffectDefinition } from './card';
import type { ConditionSpec } from './rule';
import type { EventPhase } from './event';
import type { GameTiming } from './timing';

export type SkillType =
  | 'active'
  | 'passive'
  | 'locked'
  | 'lord'
  | 'limited'
  | 'awaken';

export interface SkillDefinition {
  id: string;
  name: string;
  characterId: string;
  type: SkillType;
  description: string;
  timings: GameTiming[];
  effects?: EffectDefinition[];
  /** 在 timing 的哪个结算阶段触发；默认由 timing 推断（AFTER_* → post） */
  triggerPhase?: EventPhase;
  /** 同 phase 内优先级，越大越先 */
  priority?: number;
  conditions?: ConditionSpec[];
  /** 交互模式名，见 InteractionRegistry */
  handler?: string;
  handlerParams?: Record<string, unknown>;
  /** 出牌阶段限一次等 */
  limitPerTurn?: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  kingdom: 'wei' | 'shu' | 'wu' | 'qun';
  maxHp: number;
  skills: SkillDefinition[];
  aliases?: string[];
}
