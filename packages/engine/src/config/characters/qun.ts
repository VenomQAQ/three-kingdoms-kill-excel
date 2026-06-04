import { GameTiming } from '../../types/timing';
import { character } from './_helpers';

/** 群雄 · 界限突破（6 将） */
export const QUN_CHARACTERS = [
  character({
    id: 'hua_tuo',
    name: '界华佗',
    kingdom: 'qun',
    maxHp: 3,
    aliases: ['华佗', '界华佗', '药到病除', '神医'],
    skills: [
      {
        id: 'jijiu',
        name: '急救',
        type: 'active',
        description: '你的回合外，你可以将一张红色牌当【桃】使用。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { as: 'tao', color: 'red' } }],
      },
      {
        id: 'qingnang',
        name: '青囊',
        type: 'active',
        description:
          '出牌阶段限一次，你可以弃置一张手牌并令一名角色回复 1 点体力；若弃置的为红色牌，可再次发动（不能选择本回合已选过的角色）。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [
          { action: 'discard', params: { count: 1 } },
          { action: 'recover', params: { amount: 1 } },
        ],
      },
    ],
  }),
  character({
    id: 'lv_bu',
    name: '界吕布',
    kingdom: 'qun',
    maxHp: 5,
    aliases: ['吕布', '界吕布', '武的化身', '不败战神'],
    skills: [
      {
        id: 'wushuang',
        name: '无双',
        type: 'locked',
        description:
          '锁定技。你使用的【杀】需两张【闪】才能抵消；与你【决斗】的角色每次需打出两张【杀】。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
      {
        id: 'liyu',
        name: '利驭',
        type: 'active',
        description:
          '当你使用的【杀】对一名其他角色造成伤害后，该角色可令你获得其一张牌，然后你视为对其选择的另一名角色使用一张【决斗】。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'useVirtualCard', params: { as: '决斗' } }],
      },
    ],
  }),
  character({
    id: 'diao_chan',
    name: '界貂蝉',
    kingdom: 'qun',
    maxHp: 3,
    aliases: ['貂蝉', '界貂蝉', '绝世的舞姬'],
    skills: [
      {
        id: 'lijian',
        name: '离间',
        type: 'active',
        description:
          '出牌阶段限一次，你可以弃置一张牌，令一名男性角色视为对另一名男性角色使用一张【决斗】。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [{ action: 'useVirtualCard', params: { as: '决斗', viaLijian: true } }],
      },
      {
        id: 'biyue',
        name: '闭月',
        type: 'active',
        description: '结束阶段，你可以摸一张牌；若你没有手牌，则改为摸两张牌。',
        timings: [GameTiming.PHASE_END],
        effects: [{ action: 'draw', params: { count: 1, ifNoHand: 2 } }],
      },
    ],
  }),
  character({
    id: 'hua_xiong',
    name: '华雄',
    kingdom: 'qun',
    maxHp: 6,
    aliases: ['华雄', '魔将'],
    skills: [
      {
        id: 'yaowu',
        name: '耀武',
        type: 'locked',
        description:
          '锁定技。当你受到【杀】造成的伤害时，若此【杀】为红色，伤害来源回复 1 点体力或摸一张牌；若不为红色，你摸一张牌。',
        timings: [GameTiming.BEFORE_DAMAGE],
        effects: [{ action: 'draw', params: { onShaDamage: true } }],
      },
    ],
  }),
  character({
    id: 'yuan_shu',
    name: '袁术',
    kingdom: 'qun',
    maxHp: 4,
    aliases: ['袁术', '野心渐增'],
    skills: [
      {
        id: 'wangzun',
        name: '妄尊',
        type: 'active',
        description:
          '主公的准备阶段，你可以摸一张牌；若主公手牌上限 >0，本回合主公手牌上限 -1。',
        timings: [GameTiming.TURN_START],
        effects: [{ action: 'draw', params: { count: 1 } }],
      },
      {
        id: 'tongji',
        name: '同疾',
        type: 'locked',
        description:
          '锁定技。若你的手牌数大于体力值，则攻击范围内含有你的角色使用【杀】时不能指定除你以外的目标。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'gongsun_zan',
    name: '界公孙瓒',
    kingdom: 'qun',
    maxHp: 4,
    aliases: ['公孙瓒', '界公孙瓒', '白马将军'],
    skills: [
      {
        id: 'qiaomeng',
        name: '趫猛',
        type: 'active',
        description:
          '当你使用的黑色【杀】对一名角色造成伤害后，你可以弃置其装备区里的一张牌；若此牌为坐骑牌，你获得之。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'discard', params: { zone: 'equipment', color: 'blackSha' } }],
      },
      {
        id: 'yicong',
        name: '义从',
        type: 'locked',
        description:
          '锁定技。若你的体力值大于 2，你计算与其他角色的距离 -1；若不大于 2，其他角色计算与你的距离 +1。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'skipPhase', params: { distance: 'yicong' } }],
      },
    ],
  }),
];
