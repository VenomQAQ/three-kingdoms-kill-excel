import type { CardDefinition } from '../../types/card';

const otherOne: CardDefinition['targeting'] = {
  selector: 'choose',
  count: { min: 1, max: 1 },
  filter: { relation: ['other'], alive: true },
  range: { type: 'attack' },
};

export const BASIC_CARDS: CardDefinition[] = [
  {
    id: 'sha',
    name: '杀',
    type: 'basic',
    description: '对攻击范围内的一名其他角色造成1点伤害，目标可打出【闪】抵消。',
    canInitiate: true,
    defaultUsePerTurn: 1,
    targeting: otherOne,
    effects: [
      {
        action: 'promptResponse',
        params: {
          responseType: 'shan',
          onFail: [{ action: 'damage', params: { amount: 1 } }],
        },
      },
    ],
  },
  {
    id: 'shan',
    name: '闪',
    type: 'basic',
    description: '抵消【杀】或【万箭齐发】等需闪的结算。不能主动使用，仅响应。',
    canInitiate: false,
    targeting: { selector: 'none' },
    effects: [],
    responseTo: ['shan'],
  },
  {
    id: 'tao',
    name: '桃',
    type: 'basic',
    description: '回复1点体力。出牌阶段对自己使用；濒死时任意角色可打出。',
    canInitiate: true,
    targeting: {
      selector: 'self',
      filter: { relation: ['self'], alive: true },
      range: { type: 'none' },
    },
    effects: [{ action: 'recover', params: { amount: 1 } }],
  },
  {
    id: 'jiu',
    name: '酒',
    type: 'basic',
    description: '出牌阶段对自己使用：本回合下一张【杀】伤害+1；或濒死时视为【桃】。',
    canInitiate: true,
    targeting: {
      selector: 'self',
      filter: { relation: ['self'], alive: true },
      range: { type: 'none' },
    },
    effects: [{ action: 'chooseOption', params: { buff: 'sha_damage_plus_1' } }],
  },
];
