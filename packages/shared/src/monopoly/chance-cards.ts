import type { MonopolyCardDef } from './types';
import { MONOPOLY_RULES } from './constants';

const { passStartBonus, jailCellName } = MONOPOLY_RULES;

export const MONOPOLY_CHANCE_CARDS: MonopolyCardDef[] = [
  {
    id: 'chance-01',
    text: '前进到「起点」(GO)，领取 2000',
    effects: [{ type: 'move_to_start', landBonus: 2000 }],
  },
  {
    id: 'chance-02',
    text: '银行付你红利 5000',
    effects: [{ type: 'collect_bank', amount: 5000 }],
  },
  {
    id: 'chance-03',
    text: '后退三格',
    effects: [{ type: 'move_steps', steps: -3 }],
  },
  {
    id: 'chance-04',
    text: '直接进监狱——不经过起点，不领 2000',
    effects: [{ type: 'go_to_jail', targetName: jailCellName }],
  },
  {
    id: 'chance-05',
    text: '房屋修缮：每栋房子付 500，每家旅馆付 1000',
    effects: [{ type: 'property_repair', houseAmount: 500, hotelAmount: 1000 }],
  },
  {
    id: 'chance-06',
    text: '缴交穷人税 1500',
    effects: [{ type: 'pay_bank', amount: 1500 }],
  },
  {
    id: 'chance-07',
    text: '被选为董事会主席，每位玩家付你 500',
    effects: [{ type: 'collect_from_each_player', amount: 500 }],
  },
  {
    id: 'chance-08',
    text: '前往上海，若经过起点领 ¥2000',
    effects: [{ type: 'move_to_cell', targetName: '上海', passStartBonus }],
  },
  {
    id: 'chance-09',
    text: '前往最近的火车站，若有主人付双倍租金；无人拥有可购买',
    effects: [{ type: 'move_to_nearest_rail', passStartBonus, rentMultiplier: 2 }],
  },
  {
    id: 'chance-10',
    text: '超速罚款，缴交 ¥500 给银行',
    effects: [{ type: 'pay_bank', amount: 500 }],
  },
  {
    id: 'chance-11',
    text: '前往沈阳火车站，若经过起点领 ¥2000',
    effects: [{ type: 'move_to_cell', targetName: '沈阳火车站', passStartBonus }],
  },
  {
    id: 'chance-12',
    text: '银行错账，多付你 ¥1000',
    effects: [{ type: 'collect_bank', amount: 1000 }],
  },
  {
    id: 'chance-13',
    text: '和最近的玩家交换位置',
    effects: [{ type: 'swap_nearest_player' }],
  },
];
