/** 可被装备/技能在特定时机注入的规则修正 */
export type RuleModifierKey =
  | 'attackRange'
  | 'shaPerTurn'
  | 'distanceTo'
  | 'damageBonus'
  | 'responsesRequired';

export interface RuleModifier {
  id: string;
  sourceId: string;
  key: RuleModifierKey;
  /** null 表示无上限（如咆哮、连弩） */
  value: number | null;
  /** 可选：仅对某目标 seat 生效 */
  targetSeat?: number;
  expiresAt?: 'turn_end' | 'round_end' | 'next_turn_start';
}

export function mergeModifiers(
  modifiers: RuleModifier[],
  key: RuleModifierKey,
  base: number,
): number {
  let result = base;
  for (const m of modifiers.filter((x) => x.key === key)) {
    if (m.value === null) return Infinity;
    result += m.value;
  }
  return result;
}
