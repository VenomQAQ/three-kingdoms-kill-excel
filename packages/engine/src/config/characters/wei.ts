import { GameTiming } from '../../types/timing';
import { character } from './_helpers';

/** 魏国 · 界限突破（8 将） */
export const WEI_CHARACTERS = [
  character({
    id: 'cao_cao',
    name: '界曹操',
    kingdom: 'wei',
    maxHp: 4,
    aliases: ['曹操', '界曹操', '魏武帝'],
    skills: [
      {
        id: 'jianxiong',
        name: '奸雄',
        type: 'active',
        description: '当你受到伤害后，你可以获得造成此伤害的牌并摸一张牌。',
        timings: [GameTiming.AFTER_DAMAGE],
        triggerPhase: 'post',
        effects: [
          { action: 'moveCard', params: { from: 'damageCard', count: 1 } },
          { action: 'draw', params: { count: 1 } },
        ],
      },
      {
        id: 'hujia',
        name: '护驾',
        type: 'lord',
        description:
          '主公技。当你需要使用或打出【闪】时，你可以令其他魏势力角色选择是否打出一张【闪】。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'si_ma_yi',
    name: '界司马懿',
    kingdom: 'wei',
    maxHp: 3,
    aliases: ['司马懿', '界司马懿', '狼顾之鬼'],
    skills: [
      {
        id: 'fankui',
        name: '反馈',
        type: 'passive',
        description: '当你受到 1 点伤害后，你可以获得伤害来源的一张牌。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'moveCard', params: { from: 'damageSource', count: 1 } }],
      },
      {
        id: 'guicai',
        name: '鬼才',
        type: 'active',
        description: '当一名角色的判定牌生效前，你可以打出一张牌代替之。',
        timings: [GameTiming.JUDGE],
        effects: [{ action: 'modifyJudge', params: {} }],
      },
    ],
  }),
  character({
    id: 'xia_hou_dun',
    name: '界夏侯惇',
    kingdom: 'wei',
    maxHp: 4,
    aliases: ['夏侯惇', '界夏侯惇', '独眼的罗刹'],
    skills: [
      {
        id: 'ganglie',
        name: '刚烈',
        type: 'active',
        description:
          '当你受到 1 点伤害后，你可以进行判定：若结果为红色，你对伤害来源造成 1 点伤害；若结果为黑色，你弃置其一张牌。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'judge', params: { onRed: 'damage', onBlack: 'discard' } }],
      },
      {
        id: 'qingjian',
        name: '清俭',
        type: 'active',
        description: '当你于摸牌阶段外获得牌后，你可以将其中任意张牌交给其他角色。',
        timings: [GameTiming.CARD_DRAWN],
        effects: [{ action: 'giveCards', params: { min: 1 } }],
      },
    ],
  }),
  character({
    id: 'zhang_liao',
    name: '界张辽',
    kingdom: 'wei',
    maxHp: 4,
    aliases: ['张辽', '界张辽', '晋阳侯'],
    skills: [
      {
        id: 'tuxi',
        name: '突袭',
        type: 'active',
        description: '摸牌阶段，你可以少摸任意张牌并获得等量其他角色各一张手牌。',
        timings: [GameTiming.PHASE_DRAW],
        limitPerTurn: 1,
        effects: [{ action: 'moveCard', params: { from: 'othersHand', perTarget: 1 } }],
      },
    ],
  }),
  character({
    id: 'xu_chu',
    name: '界许褚',
    kingdom: 'wei',
    maxHp: 4,
    aliases: ['许褚', '界许褚', '牟乡侯'],
    skills: [
      {
        id: 'luoyi',
        name: '裸衣',
        type: 'active',
        description:
          '摸牌阶段，你可以跳过摸牌并亮出牌堆顶三张牌，然后获得其中的基本牌、武器牌和【决斗】，且直到下回合开始，你使用【杀】或【决斗】造成的伤害 +1。',
        timings: [GameTiming.PHASE_DRAW],
        limitPerTurn: 1,
        effects: [{ action: 'showCard', params: { count: 3 } }],
      },
    ],
  }),
  character({
    id: 'guo_jia',
    name: '界郭嘉',
    kingdom: 'wei',
    maxHp: 3,
    aliases: ['郭嘉', '界郭嘉', '英才天妒'],
    skills: [
      {
        id: 'tiandu',
        name: '天妒',
        type: 'active',
        description: '当你的判定牌生效后，你可以获得此牌。',
        timings: [GameTiming.AFTER_JUDGE],
        effects: [{ action: 'moveCard', params: { from: 'judgeResult' } }],
      },
      {
        id: 'yiji',
        name: '遗计',
        type: 'active',
        description:
          '当你受到 1 点伤害后，你可以摸两张牌，然后将至多两张手牌交给一至两名其他角色。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [
          { action: 'draw', params: { count: 2 } },
          { action: 'giveCards', params: { max: 2 } },
        ],
      },
    ],
  }),
  character({
    id: 'zhen_ji',
    name: '甄姬',
    kingdom: 'wei',
    maxHp: 3,
    aliases: ['甄姬', '薄幸的美人'],
    skills: [
      {
        id: 'qingguo',
        name: '倾国',
        type: 'active',
        description: '你可以将一张黑色手牌当【闪】使用或打出。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { as: 'shan', color: 'black' } }],
      },
      {
        id: 'luoshen',
        name: '洛神',
        type: 'active',
        description:
          '准备阶段，你可以进行判定，若结果为黑色，你获得此牌并可以重复此流程。',
        timings: [GameTiming.TURN_START],
        effects: [{ action: 'judge', params: { repeatOnBlack: true } }],
      },
    ],
  }),
  character({
    id: 'li_dian',
    name: '界李典',
    kingdom: 'wei',
    maxHp: 3,
    aliases: ['李典', '界李典', '深明大义'],
    skills: [
      {
        id: 'xunxun',
        name: '恂恂',
        type: 'active',
        description:
          '摸牌阶段开始时，你可以观看牌堆顶四张牌，将其中两张置于牌堆顶，其余置于牌堆底。',
        timings: [GameTiming.BEFORE_DRAW],
        limitPerTurn: 1,
        effects: [{ action: 'showCard', params: { count: 4, arrange: 2 } }],
      },
      {
        id: 'wangxi',
        name: '忘隙',
        type: 'active',
        description:
          '当你对其他角色造成 1 点伤害后，或受到其他角色造成的 1 点伤害后，你可以与该角色各摸一张牌。',
        timings: [GameTiming.AFTER_DAMAGE],
        effects: [{ action: 'draw', params: { count: 1, both: true } }],
      },
    ],
  }),
];
