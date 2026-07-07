export * from './types';
export * from './constants';
export * from './property-templates';
export * from './board-slots';
export * from './build-board';
export * from './pricing';
export * from './board';
export * from './chance-cards';
export * from './fate-cards';

import type { MonopolyCardDef, MonopolyCardPool } from './types';
import { MONOPOLY_CHANCE_CARDS } from './chance-cards';
import { MONOPOLY_FATE_CARDS } from './fate-cards';

const CARD_POOLS: Record<MonopolyCardPool, MonopolyCardDef[]> = {
  chance: MONOPOLY_CHANCE_CARDS,
  fate: MONOPOLY_FATE_CARDS,
};

export function getMonopolyCardPool(pool: MonopolyCardPool): MonopolyCardDef[] {
  return CARD_POOLS[pool];
}

export function drawMonopolyCard(pool: MonopolyCardPool, random = Math.random): MonopolyCardDef {
  const cards = CARD_POOLS[pool];
  return cards[Math.floor(random() * cards.length)]!;
}
