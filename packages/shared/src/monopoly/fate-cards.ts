import type { MonopolyCardDef } from './types';
import { MONOPOLY_RULES } from './constants';

const { passStartBonus, jailCellName } = MONOPOLY_RULES;

export const MONOPOLY_FATE_CARDS: MonopolyCardDef[] = [
  {
    id: 'fate-01',
    text: '前进到「起点」，领取 ¥2000 元',
    effects: [{ type: 'move_to_start', landBonus: 2000 }],
  },
  {
    id: 'fate-02',
    text: '银行记账错误对你有利，领 ¥2000 元',
    effects: [{ type: 'collect_bank', amount: 2000 }],
  },
  {
    id: 'fate-03',
    text: '今天是你生日！每位玩家给你 ¥500 元',
    effects: [{ type: 'collect_from_each_player', amount: 500 }],
  },
  {
    id: 'fate-04',
    text: '遗产继承，领 ¥1000 元',
    effects: [{ type: 'collect_bank', amount: 1000 }],
  },
  {
    id: 'fate-05',
    text: '保险到期，领 ¥1000 元',
    effects: [{ type: 'collect_bank', amount: 1000 }],
  },
  {
    id: 'fate-06',
    text: '医疗费，付 ¥1000 元给银行',
    effects: [{ type: 'pay_bank', amount: 1000 }],
  },
  {
    id: 'fate-07',
    text: '所得税，付 ¥800 元给银行',
    effects: [{ type: 'pay_bank', amount: 800 }],
  },
  {
    id: 'fate-08',
    text: '街道修缮税：每间房子 ¥200 元，每间旅馆 ¥500 元',
    effects: [{ type: 'property_repair', houseAmount: 200, hotelAmount: 500 }],
  },
  {
    id: 'fate-09',
    text: '直接进监狱——不经过起点，不领钱',
    effects: [{ type: 'go_to_jail', targetName: jailCellName }],
  },
  {
    id: 'fate-10',
    text: '彩票中奖，领 ¥2000 元',
    effects: [{ type: 'collect_bank', amount: 2000 }],
  },
  {
    id: 'fate-11',
    text: '前进三格',
    effects: [{ type: 'move_steps', steps: 3 }],
  },
  {
    id: 'fate-12',
    text: '后退三格',
    effects: [{ type: 'move_steps', steps: -3 }],
  },
  {
    id: 'fate-13',
    text: '被选为董事会主席，每位玩家付你 500',
    effects: [{ type: 'collect_from_each_player', amount: 500 }],
  },
];
