import type { MonopolyPropertyTemplate } from './types';

/** 地块经济模板 SSOT：购买价、各等级租金、升级花费 */
export const MONOPOLY_PROPERTY_TEMPLATES: Record<string, MonopolyPropertyTemplate> = {
  'city-green-a': {
    id: 'city-green-a',
    kind: 'city',
    purchasePrice: 3200,
    levels: [
      { level: 1, rent: 420, upgradeCost: 1800 },
      { level: 2, rent: 760, upgradeCost: 2400 },
      { level: 3, rent: 1160 },
    ],
  },
  'city-green-b': {
    id: 'city-green-b',
    kind: 'city',
    purchasePrice: 3500,
    levels: [
      { level: 1, rent: 460, upgradeCost: 1900 },
      { level: 2, rent: 820, upgradeCost: 2500 },
      { level: 3, rent: 1240 },
    ],
  },
  'city-gray-a': {
    id: 'city-gray-a',
    kind: 'city',
    purchasePrice: 2600,
    levels: [
      { level: 1, rent: 340, upgradeCost: 1500 },
      { level: 2, rent: 620, upgradeCost: 2000 },
      { level: 3, rent: 940 },
    ],
  },
  'city-gray-b': {
    id: 'city-gray-b',
    kind: 'city',
    purchasePrice: 2600,
    levels: [
      { level: 1, rent: 360, upgradeCost: 1500 },
      { level: 2, rent: 640, upgradeCost: 2100 },
      { level: 3, rent: 980 },
    ],
  },
  'city-blue-a': {
    id: 'city-blue-a',
    kind: 'city',
    purchasePrice: 4000,
    levels: [
      { level: 1, rent: 520, upgradeCost: 2200 },
      { level: 2, rent: 920, upgradeCost: 3000 },
      { level: 3, rent: 1400 },
    ],
  },
  'city-blue-b': {
    id: 'city-blue-b',
    kind: 'city',
    purchasePrice: 3200,
    levels: [
      { level: 1, rent: 420, upgradeCost: 1800 },
      { level: 2, rent: 760, upgradeCost: 2400 },
      { level: 3, rent: 1160 },
    ],
  },
  'city-red-a': {
    id: 'city-red-a',
    kind: 'city',
    purchasePrice: 2800,
    levels: [
      { level: 1, rent: 360, upgradeCost: 1600 },
      { level: 2, rent: 660, upgradeCost: 2200 },
      { level: 3, rent: 1000 },
    ],
  },
  'city-red-b': {
    id: 'city-red-b',
    kind: 'city',
    purchasePrice: 2600,
    levels: [
      { level: 1, rent: 360, upgradeCost: 1500 },
      { level: 2, rent: 640, upgradeCost: 2100 },
      { level: 3, rent: 980 },
    ],
  },
  'city-yellow-a': {
    id: 'city-yellow-a',
    kind: 'city',
    purchasePrice: 2600,
    levels: [
      { level: 1, rent: 340, upgradeCost: 1500 },
      { level: 2, rent: 620, upgradeCost: 2000 },
      { level: 3, rent: 940 },
    ],
  },
  'city-yellow-b': {
    id: 'city-yellow-b',
    kind: 'city',
    purchasePrice: 2000,
    levels: [
      { level: 1, rent: 280, upgradeCost: 1200 },
      { level: 2, rent: 520, upgradeCost: 1800 },
      { level: 3, rent: 820 },
    ],
  },
  'city-purple-a': {
    id: 'city-purple-a',
    kind: 'city',
    purchasePrice: 1000,
    levels: [
      { level: 1, rent: 180, upgradeCost: 900 },
      { level: 2, rent: 360, upgradeCost: 1400 },
      { level: 3, rent: 620 },
    ],
  },
  'city-purple-b': {
    id: 'city-purple-b',
    kind: 'city',
    purchasePrice: 2600,
    levels: [
      { level: 1, rent: 340, upgradeCost: 1500 },
      { level: 2, rent: 620, upgradeCost: 2000 },
      { level: 3, rent: 940 },
    ],
  },
  'city-pink-a': {
    id: 'city-pink-a',
    kind: 'city',
    purchasePrice: 3000,
    levels: [
      { level: 1, rent: 400, upgradeCost: 1700 },
      { level: 2, rent: 720, upgradeCost: 2300 },
      { level: 3, rent: 1120 },
    ],
  },
  'rail-standard': {
    id: 'rail-standard',
    kind: 'rail',
    purchasePrice: 2000,
    rentsByOwnershipCount: [320, 640, 1280, 2560],
  },
  'rail-parking': {
    id: 'rail-parking',
    kind: 'rail',
    purchasePrice: 2000,
    rentsByOwnershipCount: [260, 520, 1040, 2080],
  },
  'utility-water': {
    id: 'utility-water',
    kind: 'utility',
    purchasePrice: 500,
    baseRent: 120,
  },
  'tax-property': {
    id: 'tax-property',
    kind: 'tax',
    amount: 1000,
  },
  'tax-income': {
    id: 'tax-income',
    kind: 'tax',
    amount: 2000,
  },
  'start-bonus': {
    id: 'start-bonus',
    kind: 'start',
    landBonus: 2000,
  },
};

export function getMonopolyPropertyTemplate(templateId: string): MonopolyPropertyTemplate | undefined {
  return MONOPOLY_PROPERTY_TEMPLATES[templateId];
}
