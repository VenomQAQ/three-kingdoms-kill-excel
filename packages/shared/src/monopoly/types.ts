import type { MonopolyBoardCell } from '../index';

export type MonopolyBoardConfig = MonopolyBoardCell[];

export interface MonopolyBoardSlot {
  index: number;
  name: string;
  country: string;
  type: import('../index').MonopolyCellType;
  propertyTemplateId?: string;
  colorGroup?: string;
}

export interface MonopolyCityLevelConfig {
  level: number;
  rent: number;
  /** 从当前等级升到下一级所需花费 */
  upgradeCost?: number;
}

export interface MonopolyCityTemplate {
  id: string;
  kind: 'city';
  purchasePrice: number;
  levels: MonopolyCityLevelConfig[];
}

export interface MonopolyRailTemplate {
  id: string;
  kind: 'rail';
  purchasePrice: number;
  /** 索引 0 = 拥有 1 处铁路时的租金，以此类推 */
  rentsByOwnershipCount: number[];
}

export interface MonopolyUtilityTemplate {
  id: string;
  kind: 'utility';
  purchasePrice: number;
  baseRent: number;
}

export interface MonopolyTaxTemplate {
  id: string;
  kind: 'tax';
  amount: number;
}

export interface MonopolyStartTemplate {
  id: string;
  kind: 'start';
  landBonus: number;
}

export type MonopolyPropertyTemplate =
  | MonopolyCityTemplate
  | MonopolyRailTemplate
  | MonopolyUtilityTemplate
  | MonopolyTaxTemplate
  | MonopolyStartTemplate;

export type MonopolyCardPool = 'chance' | 'fate';

export type MonopolyCardEffectType =
  | 'move_to_start'
  | 'move_to_cell'
  | 'move_steps'
  | 'go_to_jail'
  | 'collect_bank'
  | 'pay_bank'
  | 'collect_from_each_player'
  | 'property_repair'
  | 'move_to_nearest_rail'
  | 'swap_nearest_player';

export interface MonopolyCardEffect {
  type: MonopolyCardEffectType;
  /** move_to_cell / go_to_jail */
  targetName?: string;
  /** move_to_cell / move_steps / move_to_nearest_rail — bonus when passing start */
  passStartBonus?: number;
  /** move_to_start — bonus on arrival at start */
  landBonus?: number;
  /** move_steps — positive forward, negative backward */
  steps?: number;
  /** collect_bank / pay_bank / collect_from_each_player */
  amount?: number;
  /** property_repair */
  houseAmount?: number;
  hotelAmount?: number;
  /** move_to_nearest_rail */
  rentMultiplier?: number;
}

export interface MonopolyCardDef {
  id: string;
  text: string;
  effects: MonopolyCardEffect[];
}

export interface MonopolyRulesConfig {
  maxPlayers: number;
  startCash: number;
  passStartBonus: number;
  jailCellName: string;
  houseLevel: number;
  hotelLevel: number;
}
