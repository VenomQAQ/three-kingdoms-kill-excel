import type { MonopolyBoardCell } from '../index';
import type { MonopolyCityTemplate, MonopolyPropertyTemplate } from './types';
import { getMonopolyPropertyTemplate } from './property-templates';

export interface MonopolyRentContext {
  board: MonopolyBoardCell[];
  ownerId?: string;
  rentMultiplier?: number;
}

export function getCellLevel(cell: MonopolyBoardCell): number {
  return Math.max(1, cell.level ?? 1);
}

export function getCellTemplate(cell: MonopolyBoardCell): MonopolyPropertyTemplate | undefined {
  if (!cell.propertyTemplateId) return undefined;
  return getMonopolyPropertyTemplate(cell.propertyTemplateId);
}

export function getCellRentAtLevel(template: MonopolyCityTemplate, level: number): number {
  const config = template.levels.find((item) => item.level === level);
  return config?.rent ?? template.levels[template.levels.length - 1]?.rent ?? 0;
}

export function getCityMaxLevel(template: MonopolyCityTemplate): number {
  return template.levels[template.levels.length - 1]?.level ?? 1;
}

export function getCityUpgradeCost(template: MonopolyCityTemplate, currentLevel: number): number | null {
  const config = template.levels.find((item) => item.level === currentLevel);
  return config?.upgradeCost ?? null;
}

export function getCityNextLevelRent(template: MonopolyCityTemplate, currentLevel: number): number | null {
  const nextLevel = currentLevel + 1;
  const config = template.levels.find((item) => item.level === nextLevel);
  return config?.rent ?? null;
}

export function countOwnedProperties(board: MonopolyBoardCell[], ownerId: string, type: 'rail' | 'utility'): number {
  return board.filter((cell) => cell.type === type && cell.ownerId === ownerId).length;
}

export function resolveCellRent(cell: MonopolyBoardCell, context: MonopolyRentContext): number {
  const template = getCellTemplate(cell);
  if (!template) return cell.rent;

  let rent = cell.rent;
  switch (template.kind) {
    case 'city':
      rent = getCellRentAtLevel(template, getCellLevel(cell));
      break;
    case 'rail': {
      const owned = cell.ownerId ? countOwnedProperties(context.board, cell.ownerId, 'rail') : 1;
      const index = Math.max(0, Math.min(owned - 1, template.rentsByOwnershipCount.length - 1));
      rent = template.rentsByOwnershipCount[index] ?? 0;
      break;
    }
    case 'utility':
      rent = template.baseRent;
      break;
    case 'tax':
      rent = template.amount;
      break;
    default:
      break;
  }

  return rent * (context.rentMultiplier ?? 1);
}

export function resolveCellUpgradeCost(cell: MonopolyBoardCell): number | null {
  const template = getCellTemplate(cell);
  if (!template || template.kind !== 'city') return null;
  return getCityUpgradeCost(template, getCellLevel(cell));
}

export function canUpgradeCell(cell: MonopolyBoardCell): boolean {
  const template = getCellTemplate(cell);
  if (!template || template.kind !== 'city') return false;
  return getCellLevel(cell) < getCityMaxLevel(template);
}

export function syncCellRent(cell: MonopolyBoardCell, board: MonopolyBoardCell[]): void {
  cell.rent = resolveCellRent(cell, { board, ownerId: cell.ownerId });
}

export function countPropertyBuildings(
  cell: MonopolyBoardCell,
  houseLevel: number,
  hotelLevel: number,
): { houses: number; hotels: number } {
  const level = getCellLevel(cell);
  if (level >= hotelLevel) return { houses: 0, hotels: 1 };
  if (level >= houseLevel) return { houses: 1, hotels: 0 };
  return { houses: 0, hotels: 0 };
}
