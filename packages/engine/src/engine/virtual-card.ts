import { createCardInstance, isBlack, isRed, type CardInstance } from './card-instance';
import { cardNameFromHandEntry } from './card-label';
import type { EnginePlayerState } from '../types/game';
import { playerHasSkill } from './timing-runner';

function parseEntry(entry: string): CardInstance {
  const name = cardNameFromHandEntry(entry);
  if (/^[♠♥♣♦]\d{1,2}【.+】$/.test(entry.trim())) {
    const suit = entry.trim()[0] as CardInstance['suit'];
    const point = Number.parseInt(entry.trim().slice(1).split('【')[0] ?? '1', 10);
    return { name, suit, point: Number.isFinite(point) ? point : 1 };
  }
  return createCardInstance(name);
}

/** 含转化技的可响应牌（打出） */
export function validResponseCardsForPlayer(
  player: EnginePlayerState,
  responseType: string,
  hand: string[],
): string[] {
  const result = new Set<string>();
  for (const entry of hand) {
    const name = cardNameFromHandEntry(entry);
    if (responseType === 'sha' && name === '杀') {
      result.add(entry);
      continue;
    }
    if (responseType === 'shan' && name === '闪') {
      result.add(entry);
      continue;
    }
    if (responseType === 'wuxie' && name === '无懈可击') {
      result.add(entry);
      continue;
    }
    const inst = parseEntry(entry);
    if (playerHasSkill(player, 'wusheng') && responseType === 'sha' && isRed(inst)) {
      result.add(entry);
    }
    if (playerHasSkill(player, 'qingguo') && responseType === 'shan' && isBlack(inst)) {
      result.add(entry);
    }
    if (playerHasSkill(player, 'longdan')) {
      if (responseType === 'sha' && name === '闪') result.add(entry);
      if (responseType === 'shan' && name === '杀') result.add(entry);
    }
  }
  return [...result];
}

/** 出牌阶段：可将红色牌当【杀】使用 */
export function canUseAsSha(player: EnginePlayerState, entry: string): boolean {
  const name = cardNameFromHandEntry(entry);
  if (name === '杀') return true;
  if (playerHasSkill(player, 'wusheng')) {
    return isRed(parseEntry(entry));
  }
  if (playerHasSkill(player, 'longdan') && name === '闪') return true;
  return false;
}

/** 可将黑色牌当【闪】打出 */
export function canUseAsShan(player: EnginePlayerState, entry: string): boolean {
  const name = cardNameFromHandEntry(entry);
  if (name === '闪') return true;
  if (playerHasSkill(player, 'qingguo')) {
    return isBlack(parseEntry(entry));
  }
  if (playerHasSkill(player, 'longdan') && name === '杀') return true;
  return false;
}
