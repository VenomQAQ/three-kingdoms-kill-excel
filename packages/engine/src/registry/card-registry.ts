import { BASIC_CARDS } from '../config/cards/basic';
import { EQUIPMENT_CARDS } from '../config/cards/equipment';
import { TRICK_CARDS } from '../config/cards/trick';
import type { CardDefinition } from '../types/card';
import { cardNameFromHandEntry } from '../engine/card-label';

const ALL_CARDS: CardDefinition[] = [
  ...BASIC_CARDS,
  ...TRICK_CARDS,
  ...EQUIPMENT_CARDS,
];

const byId = new Map<string, CardDefinition>();
const byName = new Map<string, CardDefinition>();

for (const card of ALL_CARDS) {
  byId.set(card.id, card);
  byName.set(card.name, card);
}

export class CardRegistry {
  static getById(id: string): CardDefinition | undefined {
    return byId.get(id);
  }

  static getByName(name: string): CardDefinition | undefined {
    return byName.get(cardNameFromHandEntry(name));
  }

  static getAll(): CardDefinition[] {
    return [...ALL_CARDS];
  }

  static listByType(type: CardDefinition['type']): CardDefinition[] {
    return ALL_CARDS.filter((c) => c.type === type);
  }

  /** 可作为某类响应打出的牌名 */
  static cardsForResponse(responseType: string): string[] {
    if (responseType === 'shan') return ['闪'];
    if (responseType === 'sha') return ['杀'];
    if (responseType === 'tao') return ['桃'];
    if (responseType === 'wuxie') return ['无懈可击'];
    return [];
  }
}
