import { CharacterRegistry } from '../registry/character-registry';
import { CardRegistry } from '../registry/card-registry';
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
    if (player.skillUseCount._yijue_non_locked_disabled && s.type !== 'locked') return false;
    if (!s.timings.includes(timing)) return false;
    if (
      opts?.activeOnly &&
      s.type !== 'active' &&
      s.type !== 'lord' &&
      s.type !== 'limited'
    ) {
      return false;
    }
    if (s.type === 'limited' && player.usedLimitedSkills?.[s.id]) return false;
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
  if (skillId === 'jianyan' && player.usedLimitedSkills?.qianxin) return true;

  const ch = CharacterRegistry.resolve(player.generalName);
  return (
    ch?.skills.some(
      (s) => s.id === skillId && (!player.skillUseCount._yijue_non_locked_disabled || s.type === 'locked'),
    ) ?? false
  );
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
  const timings =
    timing === GameTiming.BEFORE_DRAW
      ? [GameTiming.BEFORE_DRAW, GameTiming.PHASE_DRAW]
      : [timing];
  const skills = timings.flatMap((item) => skillsAtTiming(player, item, { activeOnly: true }));
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
  if (skill.timings.includes(GameTiming.PHASE_DRAW)) {
    player.skillUseCount['_skip_draw'] = 1;
  }

  if (skill.id === 'luoyi') {
    const revealed = deck?.drawMany(3) ?? [];
    const gained = revealed.filter(isLuoyiGainCard);
    player.handCards.push(...gained);
    player.skillUseCount['_luoyi_damage_plus'] = 1;
    log(
      `${player.generalName} 发动【${skill.name}】，亮出 ${formatCardList(revealed)}，获得 ${formatCardList(gained)}，下回合开始前【杀】或【决斗】伤害+1`,
    );
    return;
  }

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

function isLuoyiGainCard(entry: string): boolean {
  const card = CardRegistry.getByName(entry);
  return card?.type === 'basic' || card?.subType === 'weapon' || card?.name === '决斗';
}

function formatCardList(cards: string[]): string {
  return cards.length > 0 ? cards.join('、') : '无';
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
  const skills = ch ? [...ch.skills] : [];
  if (player.usedLimitedSkills?.qianxin && !skills.some((skill) => skill.id === 'jianyan')) {
    skills.push({
      id: 'jianyan',
      name: '荐言',
      characterId: 'jie_xushu',
      type: 'active',
      description:
        '出牌阶段限一次，你可以声明一种牌的类别或颜色，亮出牌堆顶符合声明的第一张牌并交给一名男性角色。',
      timings: [GameTiming.PHASE_PLAY],
      limitPerTurn: 1,
    });
  }

  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
  }));
}
