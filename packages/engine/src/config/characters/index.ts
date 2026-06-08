import type { CharacterDefinition } from '../../types/skill';
import { QUN_CHARACTERS } from './qun';
import { SHU_CHARACTERS } from './shu';
import { WEI_CHARACTERS } from './wei';
import { WU_CHARACTERS } from './wu';

/**
 * 界限突破 30 将（魏 8 / 蜀 8 / 吴 8 / 群 6）
 * 与 docs/cards/characters.md 对齐；技能 timings/effects 供 EventManager 与后续 L2/L3 实现挂载。
 */
export const CHARACTERS: CharacterDefinition[] = [
  ...WEI_CHARACTERS,
  ...SHU_CHARACTERS,
  ...WU_CHARACTERS,
  ...QUN_CHARACTERS,
];

export { WEI_CHARACTERS, SHU_CHARACTERS, WU_CHARACTERS, QUN_CHARACTERS };
