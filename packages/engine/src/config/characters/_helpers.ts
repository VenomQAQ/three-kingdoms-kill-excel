import type { CharacterDefinition, SkillDefinition } from '../../types/skill';

type SkillInput = Omit<SkillDefinition, 'characterId'> & { characterId?: string };

/** 为技能自动填充 characterId */
export function character(
  def: Omit<CharacterDefinition, 'skills'> & { skills: SkillInput[] },
): CharacterDefinition {
  return {
    ...def,
    skills: def.skills.map((s) => ({
      ...s,
      characterId: s.characterId ?? def.id,
    })),
  };
}
