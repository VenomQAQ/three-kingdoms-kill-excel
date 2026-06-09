import type { EnginePlayerState } from '../types/game';
import type { DeckPile } from './deck-pile';

export interface ZoneCardOption {
  id: string;
  zone: 'hand' | 'equipment';
  index: number;
  label: string;
}

/** 列出目标角色手牌区与装备区可选牌（手牌隐藏身份并打乱顺序） */
export function listZoneCards(
  target: EnginePlayerState,
  options?: { hideHand?: boolean; shuffleHand?: boolean },
): ZoneCardOption[] {
  const hideHand = options?.hideHand ?? true;
  const shuffleHand = options?.shuffleHand ?? true;

  const handEntries = target.handCards.map((c, index) => ({ c, index }));
  if (shuffleHand && handEntries.length > 1) {
    for (let i = handEntries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [handEntries[i], handEntries[j]] = [handEntries[j]!, handEntries[i]!];
    }
  }

  const result: ZoneCardOption[] = [];
  handEntries.forEach(({ index }, displayIdx) => {
    result.push({
      id: `hand:${index}`,
      zone: 'hand',
      index,
      label: hideHand ? `手牌 ${displayIdx + 1}` : `手牌【${target.handCards[index]}】`,
    });
  });

  target.equipment.forEach((c, i) => {
    result.push({
      id: `equipment:${i}`,
      zone: 'equipment',
      index: i,
      label: `装备【${c}】`,
    });
  });
  return result;
}

export function parseZoneCardId(
  choiceId: string,
): { zone: 'hand' | 'equipment'; index: number } | null {
  const m = choiceId.match(/^(hand|equipment):(\d+)$/);
  if (!m) return null;
  return { zone: m[1] as 'hand' | 'equipment', index: Number(m[2]) };
}

/** 弃置目标区域内指定牌 */
export function discardZoneCard(
  target: EnginePlayerState,
  zone: 'hand' | 'equipment',
  index: number,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): boolean {
  if (zone === 'hand') {
    if (index < 0 || index >= target.handCards.length) return false;
    const removed = target.handCards.splice(index, 1)[0]!;
    deck?.discardCard(removed);
    log(`${target.generalName} 弃置手牌【${removed}】`);
    return true;
  }
  if (index < 0 || index >= target.equipment.length) return false;
  const removed = target.equipment.splice(index, 1)[0]!;
  deck?.discardCard(removed);
  log(`${target.generalName} 失去装备【${removed}】`);
  return true;
}

/** 获得目标区域内指定牌 */
export function takeZoneCard(
  from: EnginePlayerState,
  to: EnginePlayerState,
  zone: 'hand' | 'equipment',
  index: number,
  log: (msg: string) => void,
): boolean {
  if (zone === 'hand') {
    if (index < 0 || index >= from.handCards.length) return false;
    const taken = from.handCards.splice(index, 1)[0]!;
    to.handCards.push(taken);
    log(`${to.generalName} 获得 ${from.generalName} 的一张手牌`);
    return true;
  }
  if (index < 0 || index >= from.equipment.length) return false;
  const taken = from.equipment.splice(index, 1)[0]!;
  to.handCards.push(taken);
  log(`${to.generalName} 获得 ${from.generalName} 的装备【${taken}】`);
  return true;
}
