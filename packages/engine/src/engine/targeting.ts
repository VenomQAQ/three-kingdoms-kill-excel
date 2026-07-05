import type { CardDefinition } from '../types/card';
import type { EnginePlayerState } from '../types/game';
import { playerHasSkill } from './timing-runner';

/** 座位环距离（最小路径） */
export function seatDistance(
  players: EnginePlayerState[],
  fromSeat: number,
  toSeat: number,
): number {
  const n = players.length;
  if (n <= 1) return 0;
  const diff = Math.abs(fromSeat - toSeat);
  return Math.min(diff, n - diff);
}

export function getAttackRange(player: EnginePlayerState): number {
  let range = 1;
  for (const eq of player.equipment) {
    if (eq.includes('诸葛连弩') || eq.includes('青釭剑')) range = Math.max(range, 1);
    if (eq.includes('青龙偃月刀') || eq.includes('丈八蛇矛') || eq.includes('贯石斧'))
      range = Math.max(range, 3);
    if (eq.includes('方天画戟')) range = Math.max(range, 4);
    if (eq.includes('麒麟弓')) range = Math.max(range, 5);
  }
  for (const eq of player.equipment) {
    if (eq.includes('赤兔') || eq.includes('大宛') || eq.includes('紫骍')) range += 1;
  }
  return range;
}

export function distanceBetween(
  players: EnginePlayerState[],
  from: EnginePlayerState,
  to: EnginePlayerState,
): number {
  let d = seatDistance(players, from.seat, to.seat);
  for (const eq of to.equipment) {
    if (eq.includes('的卢') || eq.includes('绝影')) d += 1;
  }
  for (const eq of from.equipment) {
    if (eq.includes('赤兔') || eq.includes('大宛') || eq.includes('紫骍')) d -= 1;
  }
  if (playerHasSkill(from, 'mashi')) d = Math.max(1, d - 1);
  if (playerHasSkill(from, 'yicong') && from.hp > 2) d = Math.max(1, d - 1);
  if (playerHasSkill(to, 'yicong') && to.hp <= 2) d += 1;
  return Math.max(1, d);
}

export function isInAttackRange(
  players: EnginePlayerState[],
  attacker: EnginePlayerState,
  target: EnginePlayerState,
): boolean {
  if (attacker.id === target.id) return false;
  return distanceBetween(players, attacker, target) <= getAttackRange(attacker);
}

export function getValidTargets(
  card: CardDefinition,
  source: EnginePlayerState,
  players: EnginePlayerState[],
): EnginePlayerState[] {
  const rule = card.targeting;
  const alive = players.filter((p) => p.hp > 0);

  if (rule.selector === 'none') return [];
  if (rule.selector === 'self') return [source];

  const candidates = alive.filter((p) => {
    if (rule.selector === 'all') return true;
    if (rule.selector === 'allOthers') return p.id !== source.id;
    if (rule.filter?.relation?.includes('self') && p.id === source.id) return true;
    if (p.id === source.id && !rule.filter?.relation?.includes('self')) return false;
    if (rule.filter?.relation?.includes('other') && p.id === source.id) return false;
    return true;
  });

  const skillFiltered = candidates.filter((target) => {
    if (
      (card.id === 'sha' || card.id === 'juedou') &&
      target.handCards.length === 0 &&
      playerHasSkill(target, 'kongcheng')
    ) {
      return false;
    }
    return true;
  });

  const tongjiTargets =
    card.id === 'sha'
      ? skillFiltered.filter(
          (target) =>
            target.id !== source.id &&
            target.handCards.length > target.hp &&
            playerHasSkill(target, 'tongji') &&
            isInAttackRange(players, source, target),
        )
      : [];
  if (tongjiTargets.length > 0) return tongjiTargets;

  const range = rule.range;
  if (!range || range.type === 'none' || range.type === 'unlimited') {
    return skillFiltered;
  }
  if (card.type === 'trick' && playerHasSkill(source, 'qicai')) {
    return skillFiltered;
  }
  if (range.type === 'attack') {
    const atk = getAttackRange(source);
    return skillFiltered.filter(
      (t) => t.id === source.id || distanceBetween(players, source, t) <= atk,
    );
  }
  if (range.type === 'fixed' && range.value != null) {
    return skillFiltered.filter(
      (t) =>
        t.id === source.id ||
        distanceBetween(players, source, t) <= range.value!,
    );
  }
  return skillFiltered;
}

export function needsTargetSelection(card: CardDefinition): boolean {
  return (
    card.targeting.selector === 'choose' &&
    (card.targeting.count?.min ?? 0) > 0
  );
}

/** 万箭/南蛮等：从使用者起逆时针（座位序）排列目标 */
export function sortAoeTargets(
  players: EnginePlayerState[],
  source: EnginePlayerState,
  targets: EnginePlayerState[],
): EnginePlayerState[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const startIdx = ordered.findIndex((p) => p.id === source.id);
  const result: EnginePlayerState[] = [];
  for (let i = 1; i <= ordered.length; i++) {
    const p = ordered[(startIdx + i) % ordered.length]!;
    const t = targets.find((x) => x.id === p.id);
    if (t && t.hp > 0) result.push(t);
  }
  return result;
}
