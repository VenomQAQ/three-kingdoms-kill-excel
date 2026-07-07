import type { MonopolyBoardCell } from '../index';
import { MONOPOLY_BOARD_SLOTS } from './board-slots';
import { getMonopolyPropertyTemplate } from './property-templates';
import { getCellRentAtLevel } from './pricing';

export function buildMonopolyBoard(): MonopolyBoardCell[] {
  return MONOPOLY_BOARD_SLOTS.map((slot) => {
    const template = slot.propertyTemplateId ? getMonopolyPropertyTemplate(slot.propertyTemplateId) : undefined;
    const base: MonopolyBoardCell = {
      index: slot.index,
      name: slot.name,
      country: slot.country,
      type: slot.type,
      propertyTemplateId: slot.propertyTemplateId,
      price: 0,
      rent: 0,
      colorGroup: slot.colorGroup,
      level: slot.type === 'city' ? 1 : undefined,
    };

    if (!template) return base;

    switch (template.kind) {
      case 'city':
        return {
          ...base,
          price: template.purchasePrice,
          displayPrice: template.purchasePrice,
          rent: getCellRentAtLevel(template, 1),
        };
      case 'rail':
      case 'utility':
        return {
          ...base,
          price: template.purchasePrice,
          displayPrice: template.purchasePrice,
          rent: template.kind === 'utility' ? template.baseRent : template.rentsByOwnershipCount[0] ?? 0,
        };
      case 'tax':
        return {
          ...base,
          displayPrice: template.amount,
          rent: template.amount,
        };
      case 'start':
        return {
          ...base,
          displayPrice: template.landBonus,
          rent: 0,
        };
      default:
        return base;
    }
  });
}
