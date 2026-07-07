import type { MonopolyRulesConfig } from './types';

export const MONOPOLY_RULES: MonopolyRulesConfig = {
  minPlayers: 2,
  maxPlayers: 8,
  startCash: 15000,
  passStartBonus: 2000,
  jailCellName: '入牢',
  /** 入狱后需服刑回合数（不含入狱当回合） */
  jailTurns: 2,
  houseLevel: 2,
  hotelLevel: 3,
};
