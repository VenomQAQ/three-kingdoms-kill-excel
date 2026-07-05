import { GameTiming } from '../../types/timing';
import { character } from './_helpers';

/** 吴国 · 界限突破（8 将） */
export const WU_CHARACTERS = [
  character({
    id: 'sun_quan',
    name: '孙权',
    kingdom: 'wu',
    maxHp: 4,
    aliases: ['孙权', '吴王', '年轻的贤君'],
    skills: [
      {
        id: 'zhiheng',
        name: '制衡',
        type: 'active',
        description: '出牌阶段限一次，你可以弃置任意张牌并摸等量的牌。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [{ action: 'discard', params: { zone: 'hand', chooseCount: true } }],
      },
      {
        id: 'jiuyuan',
        name: '救援',
        type: 'lord',
        description:
          '主公技。当主公需要使用或打出【桃】时，其他吴势力角色可打出【桃】（视为由主公使用或打出）。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'gan_ning',
    name: '界甘宁',
    kingdom: 'wu',
    maxHp: 4,
    aliases: ['甘宁', '界甘宁', '锦帆游侠'],
    skills: [
      {
        id: 'qixi',
        name: '奇袭',
        type: 'active',
        description: '你可以将一张黑色牌当【过河拆桥】使用。',
        timings: [GameTiming.PHASE_PLAY, GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { as: '过河拆桥', color: 'black' } }],
      },
      {
        id: 'fenwei',
        name: '奋威',
        type: 'active',
        description: '当一张锦囊牌对多个目标生效时，你可以弃一张牌取消此锦囊对你的影响。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'discard', params: { count: 1, cancelTrickOnSelf: true } }],
      },
    ],
  }),
  character({
    id: 'lv_meng',
    name: '界吕蒙',
    kingdom: 'wu',
    maxHp: 4,
    aliases: ['吕蒙', '界吕蒙', '白衣渡江'],
    skills: [
      {
        id: 'keji',
        name: '克己',
        type: 'active',
        description: '若你未于出牌阶段使用或打出【杀】，你可以跳过弃牌阶段。',
        timings: [GameTiming.PHASE_DISCARD],
        effects: [{ action: 'skipPhase', params: { phase: 'discard' } }],
      },
      {
        id: 'qinxue',
        name: '勤学',
        type: 'active',
        description:
          '弃牌阶段，你可以弃置一张手牌并摸两张牌；若你于此阶段弃置了两种花色的牌，则你下回合使用【杀】的次数 +1。',
        timings: [GameTiming.PHASE_DISCARD],
        effects: [
          { action: 'discard', params: { count: 1 } },
          { action: 'draw', params: { count: 2 } },
        ],
      },
    ],
  }),
  character({
    id: 'huang_gai',
    name: '界黄盖',
    kingdom: 'wu',
    maxHp: 4,
    aliases: ['黄盖', '界黄盖', '轻身为国'],
    skills: [
      {
        id: 'kurou',
        name: '苦肉',
        type: 'active',
        description: '出牌阶段，你可以失去 1 点体力，然后摸两张牌。',
        timings: [GameTiming.PHASE_PLAY],
        effects: [
          { action: 'damage', params: { amount: 1, self: true } },
          { action: 'draw', params: { count: 2 } },
        ],
      },
      {
        id: 'zhaxiang',
        name: '诈降',
        type: 'active',
        description:
          '当你失去 1 点体力后，若当前体力值为 1，你可以弃置一张红色牌并回复 1 点体力或摸两张牌。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'chooseOption', params: { onHp1: true } }],
      },
    ],
  }),
  character({
    id: 'zhou_yu',
    name: '界周瑜',
    kingdom: 'wu',
    maxHp: 3,
    aliases: ['周瑜', '界周瑜', '大都督'],
    skills: [
      {
        id: 'yingzi',
        name: '英姿',
        type: 'locked',
        description:
          '锁定技。摸牌阶段，你额外摸一张牌；你的手牌上限等于 X（X 为你的体力上限）。',
        timings: [GameTiming.PHASE_DRAW],
        effects: [{ action: 'draw', params: { count: 1, extra: true } }],
      },
      {
        id: 'fanjian',
        name: '反间',
        type: 'active',
        description:
          '出牌阶段限一次，你可以展示一张手牌并交给一名角色，令其选择展示所有手牌并弃置与此牌花色相同的所有牌，或失去 1 点体力。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [{ action: 'showCard', params: { giveAndChoose: true } }],
      },
    ],
  }),
  character({
    id: 'da_qiao',
    name: '界大乔',
    kingdom: 'wu',
    maxHp: 3,
    aliases: ['大乔', '界大乔', '矜持之花'],
    skills: [
      {
        id: 'guose',
        name: '国色',
        type: 'active',
        description: '你可以将一张方块牌当【乐不思蜀】使用。',
        timings: [GameTiming.PHASE_PLAY, GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { as: '乐不思蜀', suit: 'diamond' } }],
      },
      {
        id: 'liuli',
        name: '流离',
        type: 'active',
        description:
          '当你成为【杀】的目标时，你可以弃一张牌并将此【杀】转移给你攻击范围内的另一名角色（不能是原使用者）。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'chooseOption', params: { redirectSha: true } }],
      },
    ],
  }),
  character({
    id: 'lu_xun',
    name: '界陆逊',
    kingdom: 'wu',
    maxHp: 3,
    aliases: ['陆逊', '界陆逊', '儒生雄才'],
    skills: [
      {
        id: 'qianxun',
        name: '谦逊',
        type: 'active',
        description:
          '当你成为【乐不思蜀】或【顺手牵羊】的目标时，你可以弃置两张牌并取消此牌对你的影响。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'discard', params: { count: 2, cancelOnSelf: true } }],
      },
      {
        id: 'lianying',
        name: '连营',
        type: 'active',
        description: '当你失去最后的手牌后，你可以摸一张牌。',
        timings: [GameTiming.CARD_USED],
        effects: [{ action: 'draw', params: { count: 1, onHandEmpty: true } }],
      },
    ],
  }),
  character({
    id: 'sun_shang_xiang',
    name: '孙尚香',
    kingdom: 'wu',
    maxHp: 3,
    aliases: ['孙尚香', '界孙尚香', '弓腰姬'],
    skills: [
      {
        id: 'jieyin',
        name: '结姻',
        type: 'active',
        description: '出牌阶段限一次，你可以弃置两张手牌并令一名已受伤男性角色回复 1 点体力。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [
          { action: 'discard', params: { count: 2 } },
          { action: 'recover', params: { amount: 1 } },
        ],
      },
      {
        id: 'xiaoji',
        name: '枭姬',
        type: 'active',
        description: '当你失去装备区里的一张牌后，你可以摸两张牌。',
        timings: [GameTiming.EQUIP],
        effects: [{ action: 'draw', params: { count: 2 } }],
      },
    ],
  }),
];
