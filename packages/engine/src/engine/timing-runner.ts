import { CharacterRegistry } from '../registry/character-registry';
import type { CardDefinition } from '../types/card';
import type { EnginePlayerState } from '../types/game';
import type { SkillDefinition } from '../types/skill';
import { GameTiming } from '../types/timing';

export interface TimingContext {
  source?: EnginePlayerState;
  targets?: EnginePlayerState[];
  card?: CardDefinition;
  /** 即将造成的伤害点数 */
  damageAmount?: number;
  /** 由锁定技修改：有效响应次数（默认 1） */
  responsesRequired?: number;
}

export interface TimingSkillOffer {
  playerId: string;
  skill: SkillDefinition;
  message: string;
}

/** 某角色在指定时机可发动的技能 */
export function skillsAtTiming(
  player: EnginePlayerState,
  timing: GameTiming,
  opts?: { activeOnly?: boolean },
): SkillDefinition[] {
  const ch = CharacterRegistry.resolve(player.generalName);
  if (!ch) return [];
  return ch.skills.filter((s) => {
    if (!s.timings.includes(timing)) return false;
    if (opts?.activeOnly && s.type !== 'active' && s.type !== 'lord') return false;
    if (s.limitPerTurn != null && (player.skillUseCount[s.id] ?? 0) >= s.limitPerTurn) {
      return false;
    }
    return true;
  });
}

/** 角色是否拥有某技能（含未实现结算的配置） */
export function playerHasSkill(
  player: EnginePlayerState,
  skillId: string,
): boolean {
  const ch = CharacterRegistry.resolve(player.generalName);
  return ch?.skills.some((s) => s.id === skillId) ?? false;
}

/** 锁定技：修改响应次数等 */
export function applyLockedModifiers(ctx: TimingContext): void {
  const source = ctx.source;
  const card = ctx.card;
  if (!source || !card) return;

  const locked = skillsAtTiming(source, GameTiming.BEFORE_CARD_USED).filter(
    (s) => s.type === 'locked',
  );

  for (const skill of locked) {
    if (skill.id === 'wushuang' && (card.id === 'sha' || card.id === 'juedou')) {
      ctx.responsesRequired = 2;
    }
  }
}

/** 摸牌前 / 出牌阶段等：可主动发动的技能列表 */
export function collectOptionalSkillOffers(
  player: EnginePlayerState,
  timing: GameTiming,
): TimingSkillOffer[] {
  const skills = skillsAtTiming(player, timing, { activeOnly: true });
  return skills.map((skill) => ({
    playerId: player.id,
    skill,
    message: timingLabel(timing, skill.name),
  }));
}

/** 受到伤害后：奸雄等 */
export function collectReactiveSkillOffers(
  victim: EnginePlayerState,
  timing: GameTiming,
): TimingSkillOffer[] {
  const skills = skillsAtTiming(victim, timing, { activeOnly: true });
  return skills
    .filter((s) => s.type === 'active' || s.type === 'passive')
    .map((skill) => ({
      playerId: victim.id,
      skill,
      message: `${victim.generalName}：是否发动【${skill.name}】？`,
    }));
}

export function runSkillEffects(
  player: EnginePlayerState,
  skill: SkillDefinition,
  log: (msg: string) => void,
  deck?: { drawMany(n: number): string[] },
): void {
  for (const effect of skill.effects ?? []) {
    if (effect.action === 'draw') {
      const count = (effect.params?.count as number) ?? 1;
      const drawn = deck?.drawMany(count) ?? [];
      if (drawn.length > 0) {
        player.handCards.push(...drawn);
      }
      log(`${player.generalName} 发动【${skill.name}】，摸 ${count} 张牌`);
    }
  }
}

function timingLabel(timing: GameTiming, skillName: string): string {
  switch (timing) {
    case GameTiming.BEFORE_DRAW:
      return `摸牌前：是否发动【${skillName}】？`;
    case GameTiming.PHASE_PLAY:
      return `出牌阶段：是否发动【${skillName}】？`;
    default:
      return `是否发动【${skillName}】？`;
  }
}

/** 弹窗展示用：角色全部技能 */
export function characterSkillsForPrompt(
  player: EnginePlayerState,
): { id: string; name: string; description: string; type: string }[] {
  const ch = CharacterRegistry.resolve(player.generalName);
  if (!ch) return [];
  return ch.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
  }));
}
