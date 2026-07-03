import { CardRegistry } from '../registry/card-registry';
import type { CardDefinition } from '../types/card';
import type { EquipmentSlot } from '../types/card';
import type { EnginePlayerState } from '../types/game';
import type { DeckPile } from './deck-pile';

export type ZonePick = 'hand' | EquipmentSlot;

/** 从卡牌配置解析装备槽位 */
export function getEquipSlot(card: CardDefinition): EquipmentSlot | null {
  const slot = card.effects.find((e) => e.action === 'equip')?.params?.slot as
    | EquipmentSlot
    | undefined;
  if (slot) return slot;
  if (card.subType === 'weapon') return 'weapon';
  if (card.subType === 'armor') return 'armor';
  if (card.subType === 'horse_plus') return 'horse_plus';
  if (card.subType === 'horse_minus') return 'horse_minus';
  if (card.subType === 'treasure') return 'treasure';
  return null;
}

export function getEquippedInSlot(
  player: EnginePlayerState,
  slot: EquipmentSlot,
): string | undefined {
  return player.equipment.find((name) => {
    const def = CardRegistry.getByName(name);
    return def && getEquipSlot(def) === slot;
  });
}

/** 装备：同槽替换，旧牌入弃牌堆 */
export function equipToSlot(
  player: EnginePlayerState,
  card: CardDefinition,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): void {
  const slot = getEquipSlot(card);
  if (!slot) {
    if (!player.equipment.includes(card.name)) {
      player.equipment.push(card.name);
      log(`${player.generalName} 装备【${card.name}】`);
    }
    return;
  }

  const existing = getEquippedInSlot(player, slot);
  if (existing) {
    const idx = player.equipment.indexOf(existing);
    if (idx >= 0) player.equipment.splice(idx, 1);
    deck?.discardCard(existing);
    log(`${player.generalName} 替换装备，【${existing}】进入弃牌堆`);
  }

  const dupIdx = player.equipment.indexOf(card.name);
  if (dupIdx >= 0) player.equipment.splice(dupIdx, 1);
  player.equipment.push(card.name);
  log(`${player.generalName} 装备【${card.name}】（${slotLabel(slot)}）`);
}

export function unequipByName(
  player: EnginePlayerState,
  cardName: string,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): boolean {
  const idx = player.equipment.indexOf(cardName);
  if (idx < 0) return false;
  player.equipment.splice(idx, 1);
  deck?.discardCard(cardName);
  log(`${player.generalName} 失去装备【${cardName}】`);
  return true;
}

/** 弃置区域内一张牌（优先手牌，否则装备） */
export function discardOneFromZone(
  player: EnginePlayerState,
  zone: 'hand' | 'equipment' | 'any',
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): boolean {
  if (zone === 'hand' || zone === 'any') {
    if (player.handCards.length > 0) {
      const removed = player.handCards.pop()!;
      deck?.discardCard(removed);
      log(`${player.generalName} 弃置手牌【${removed}】`);
      return true;
    }
    if (zone === 'hand') return false;
  }
  if (zone === 'equipment' || zone === 'any') {
    if (player.equipment.length > 0) {
      const removed = player.equipment.pop()!;
      deck?.discardCard(removed);
      log(`${player.generalName} 失去装备【${removed}】`);
      return true;
    }
  }
  return false;
}

/** 获得对方区域内一张牌（手牌优先，否则装备区） */
export function takeOneFromZone(
  from: EnginePlayerState,
  to: EnginePlayerState,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): boolean {
  if (from.handCards.length > 0) {
    const taken = from.handCards.pop()!;
    to.handCards.push(taken);
    log(`${to.generalName} 获得 ${from.generalName} 的一张手牌`);
    return true;
  }
  if (from.equipment.length > 0) {
    const taken = from.equipment.pop()!;
    to.handCards.push(taken);
    log(`${to.generalName} 获得 ${from.generalName} 的装备【${taken}】`);
    return true;
  }
  return false;
}

export function sourceIgnoresArmor(source: EnginePlayerState): boolean {
  return source.equipment.some((e) => e.includes('青釭剑'));
}

export function hasBaguaFormation(target: EnginePlayerState): boolean {
  return target.equipment.some((e) => e.includes('八卦阵'));
}

function slotLabel(slot: EquipmentSlot): string {
  const map: Record<EquipmentSlot, string> = {
    weapon: '武器',
    armor: '防具',
    horse_plus: '+1马',
    horse_minus: '-1马',
    treasure: '宝物',
  };
  return map[slot];
}

export function playerHasWeapon(player: EnginePlayerState): boolean {
  return player.equipment.some((name) => {
    const def = CardRegistry.getByName(name);
    return def?.subType === 'weapon' || getEquipSlot(def!) === 'weapon';
  });
}

export function takeWeaponFromPlayer(
  from: EnginePlayerState,
  to: EnginePlayerState,
  deck: DeckPile | undefined,
  log: (msg: string) => void,
): boolean {
  const weapon = getEquippedInSlot(from, 'weapon');
  if (!weapon) return false;
  const idx = from.equipment.indexOf(weapon);
  if (idx < 0) return false;
  from.equipment.splice(idx, 1);
  to.handCards.push(weapon);
  log(`${to.generalName} 获得 ${from.generalName} 的武器【${weapon}】`);
  return true;
}
