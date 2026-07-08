import type { CardDefinition } from '../types/card';
import type { EnginePlayerState } from '../types/game';
import type { DeckPile } from './deck-pile';
import { CardRegistry } from '../registry/card-registry';
import { playerHasSkill } from './timing-runner';

export type ZoneCardArea = 'hand' | 'equipment' | 'judge';

export interface ZoneCardOption {
  id: string;
  zone: ZoneCardArea;
  index: number;
  label: string;
}

export interface ZoneCardTarget {
  handCards: string[];
  equipment: string[];
  judgeCards?: string[];
}

/** 配置化：卡牌效果是否需要玩家选择目标区域内的一张牌 */
export function getZonePickAction(card: CardDefinition | undefined): 'discard' | 'take' | null {
  if (!card?.effects) return null;
  for (const effect of card.effects) {
    if (effect.action === 'discard' && effect.params?.zone === 'any') return 'discard';
    if (effect.action === 'moveCard' && !effect.params?.from) return 'take';
  }
  return null;
}

export function needsZoneCardPick(card: CardDefinition | undefined): boolean {
  return getZonePickAction(card ?? ({} as CardDefinition)) != null;
}

/** 列出目标角色手牌区、装备区与判定区可选牌（手牌隐藏身份并打乱顺序） */
export function listZoneCards(
  target: ZoneCardTarget,
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

  (target.judgeCards ?? []).forEach((c, i) => {
    result.push({
      id: `judge:${i}`,
      zone: 'judge',
      index: i,
      label: `判定【${c}】`,
    });
  });

  return result;
}

export function parseZoneCardId(
  choiceId: string,
): { zone: ZoneCardArea; index: number } | null {
  const m = choiceId.match(/^(hand|equipment|judge):(\d+)$/);
  if (!m) return null;
  return { zone: m[1] as ZoneCardArea, index: Number(m[2]) };
}

export function canDiscardZoneCard(
  actor: EnginePlayerState,
  target: EnginePlayerState,
  zone: ZoneCardArea,
  index: number,
): boolean {
  if (zone !== 'equipment') return true;
  if (actor.id === target.id || !playerHasSkill(target, 'qicai')) return true;
  const equipment = target.equipment[index];
  if (!equipment) return false;
  const definition = CardRegistry.getByName(equipment);
  return definition?.subType !== 'armor' && definition?.subType !== 'treasure';
}

/** 弃置目标区域内指定牌 */
export function discardZoneCard(
  target: EnginePlayerState,
  zone: ZoneCardArea,
  index: number,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
  actor?: EnginePlayerState,
): boolean {
  if (actor && !canDiscardZoneCard(actor, target, zone, index)) return false;
  if (zone === 'hand') {
    if (index < 0 || index >= target.handCards.length) return false;
    const removed = target.handCards.splice(index, 1)[0]!;
    deck?.discardCard(removed);
    log(`${target.generalName} 弃置手牌【${removed}】`);
    return true;
  }
  if (zone === 'equipment') {
    if (index < 0 || index >= target.equipment.length) return false;
    const removed = target.equipment.splice(index, 1)[0]!;
    deck?.discardCard(removed);
    log(`${target.generalName} 失去装备【${removed}】`);
    return true;
  }
  if (index < 0 || index >= target.judgeCards.length) return false;
  const removed = target.judgeCards.splice(index, 1)[0]!;
  deck?.discardCard(removed);
  log(`${target.generalName} 失去判定区【${removed}】`);
  return true;
}

/** 获得目标区域内指定牌 */
export function takeZoneCard(
  from: EnginePlayerState,
  to: EnginePlayerState,
  zone: ZoneCardArea,
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
  if (zone === 'equipment') {
    if (index < 0 || index >= from.equipment.length) return false;
    const taken = from.equipment.splice(index, 1)[0]!;
    to.handCards.push(taken);
    log(`${to.generalName} 获得 ${from.generalName} 的装备【${taken}】`);
    return true;
  }
  if (index < 0 || index >= from.judgeCards.length) return false;
  const taken = from.judgeCards.splice(index, 1)[0]!;
  to.handCards.push(taken);
  log(`${to.generalName} 获得 ${from.generalName} 的判定区【${taken}】`);
  return true;
}
