import { CharacterRegistry } from '../registry/character-registry';
import type { SkillDefinition } from '../types/skill';
import type { RuleDefinition } from '../types/rule';
import { GameTiming } from '../types/timing';
import type { EventPhase } from '../types/event';

function inferPhase(timing: GameTiming, explicit?: EventPhase): EventPhase {
  if (explicit) return explicit;
  if (
    timing.startsWith('BEFORE_') ||
    timing === GameTiming.BEFORE_JUDGE ||
    timing === GameTiming.BEFORE_CARD_USED ||
    timing === GameTiming.BEFORE_DAMAGE
  ) {
    return 'pre';
  }
  if (timing === GameTiming.DAMAGE || timing === GameTiming.JUDGE) {
    return 'on';
  }
  return 'post';
}

function skillToRules(skill: SkillDefinition, characterId: string): RuleDefinition[] {
  return skill.timings.map((timing, index) => ({
    id: `skill:${characterId}:${skill.id}:${timing}:${index}`,
    source: { type: 'skill', id: skill.id },
    timing,
    phase: inferPhase(timing, skill.triggerPhase),
    priority: skill.priority ?? (skill.type === 'locked' ? 100 : 50),
    conditions: skill.conditions,
    effects: skill.effects,
    handler: skill.handler,
    handlerParams: skill.handlerParams,
  }));
}

/**
 * 从静态配置加载全部 Rule，启动时一次性注册到 RuleManager。
 */
export class ConfigRuleLoader {
  loadAll(): RuleDefinition[] {
    const rules: RuleDefinition[] = [];
    for (const ch of CharacterRegistry.getAll()) {
      for (const skill of ch.skills) {
        rules.push(...skillToRules(skill, ch.id));
      }
    }
    return rules;
  }
}
