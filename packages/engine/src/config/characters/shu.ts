import { GameTiming } from '../../types/timing';
import { character } from './_helpers';

/** 蜀国 · 界限突破（8 将） */
export const SHU_CHARACTERS = [
  character({
    id: 'liu_bei',
    name: '界刘备',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['刘备', '界刘备', '汉昭烈帝'],
    skills: [
      {
        id: 'rende',
        name: '仁德',
        type: 'active',
        description:
          '出牌阶段每名角色限一次，你可以将任意张手牌交给一名其他角色；当你于此阶段内第二次以此法给牌后，你可以视为使用一张基本牌。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 99,
        effects: [{ action: 'giveCards', params: { min: 1 } }],
      },
      {
        id: 'jijiang',
        name: '激将',
        type: 'lord',
        description:
          '主公技。当你需要使用或打出【杀】时，你可以令其他蜀势力角色选择是否打出一张【杀】。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'guan_yu',
    name: '界关羽',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['关羽', '界关羽', '壮缪侯'],
    skills: [
      {
        id: 'wusheng',
        name: '武圣',
        type: 'active',
        description: '你可以将一张红色牌当【杀】使用或打出。',
        timings: [GameTiming.PHASE_PLAY, GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { as: 'sha', color: 'red' } }],
      },
      {
        id: 'yijue',
        name: '义绝',
        type: 'active',
        description:
          '出牌阶段限一次，你可以与一名角色拼点：若你赢，其本回合不能使用或打出手牌且非锁定技失效；若你没赢，你可以令其回复 1 点体力。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [{ action: 'chooseOption', params: { type: 'pinDian' } }],
      },
    ],
  }),
  character({
    id: 'zhang_fei',
    name: '界张飞',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['张飞', '界张飞', '新亭侯'],
    skills: [
      {
        id: 'paoxiao',
        name: '咆哮',
        type: 'locked',
        description: '锁定技。你使用【杀】无次数限制。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'skipPhase', params: { limit: 'sha' } }],
      },
      {
        id: 'tishen',
        name: '替身',
        type: 'limited',
        description:
          '限定技。准备阶段，你可以将体力回复至等同于上回合结束时的体力，然后摸 X 张牌（X 为回复的体力值）。',
        timings: [GameTiming.TURN_START],
        limitPerTurn: 1,
        effects: [{ action: 'recover', params: { toLastTurnHp: true } }],
      },
    ],
  }),
  character({
    id: 'zhu_ge_liang',
    name: '诸葛亮',
    kingdom: 'shu',
    maxHp: 3,
    aliases: ['诸葛亮', '忠武侯'],
    skills: [
      {
        id: 'guanxing',
        name: '观星',
        type: 'active',
        description:
          '准备阶段，你可以观看牌堆顶五张牌（存活角色 ≤3 时为三张），以任意顺序置于牌堆顶或牌堆底。',
        timings: [GameTiming.TURN_START],
        effects: [{ action: 'showCard', params: { count: 5, arrange: true } }],
      },
      {
        id: 'kongcheng',
        name: '空城',
        type: 'locked',
        description: '锁定技。若你没有手牌，你不能成为【杀】或【决斗】的目标。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'zhao_yun',
    name: '界赵云',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['赵云', '界赵云', '虎威将军', '常山赵子龙'],
    skills: [
      {
        id: 'longdan',
        name: '龙胆',
        type: 'active',
        description: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
        timings: [GameTiming.PHASE_PLAY, GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'useVirtualCard', params: { swap: ['sha', 'shan'] } }],
      },
      {
        id: 'yajiao',
        name: '涯角',
        type: 'active',
        description:
          '当你于回合外使用或打出手牌时，你可以展示牌堆顶一张牌：若与此牌类别相同，可将展示牌交给一名角色；若不同，可将展示牌置入弃牌堆。',
        timings: [GameTiming.CARD_USED],
        effects: [{ action: 'showCard', params: { count: 1 } }],
      },
    ],
  }),
  character({
    id: 'ma_chao',
    name: '界马超',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['马超', '界马超', '一骑当千'],
    skills: [
      {
        id: 'mashi',
        name: '马术',
        type: 'locked',
        description: '锁定技。你计算与其他角色的距离 -1。',
        timings: [GameTiming.BEFORE_CARD_USED],
        effects: [{ action: 'skipPhase', params: { distance: -1 } }],
      },
      {
        id: 'tieqi',
        name: '铁骑',
        type: 'active',
        description:
          '当你使用【杀】指定目标后，可令其本回合非锁定技失效，然后你判定：除非其弃置一张与结果花色相同的牌，否则不能使用【闪】响应此【杀】。',
        timings: [GameTiming.CARD_USED],
        effects: [{ action: 'judge', params: { onShaTarget: true } }],
      },
    ],
  }),
  character({
    id: 'huang_yue_ying',
    name: '界黄月英',
    kingdom: 'shu',
    maxHp: 3,
    aliases: ['黄月英', '界黄月英', '归隐的杰女'],
    skills: [
      {
        id: 'jizhi',
        name: '集智',
        type: 'active',
        description:
          '当你使用普通锦囊牌时，你可以摸一张牌；若摸到的为基本牌，可弃置之并本回合手牌上限 +1。',
        timings: [GameTiming.CARD_USED],
        effects: [{ action: 'draw', params: { count: 1 } }],
      },
      {
        id: 'qicai',
        name: '奇才',
        type: 'locked',
        description:
          '锁定技。你使用锦囊牌无距离限制；其他角色不能弃置你装备区里的防具和宝物牌。',
        timings: [GameTiming.BEFORE_CARD_USED],
      },
    ],
  }),
  character({
    id: 'xu_shu',
    name: '界徐庶',
    kingdom: 'shu',
    maxHp: 4,
    aliases: ['徐庶', '界徐庶', '化剑为犁'],
    skills: [
      {
        id: 'zhuhai',
        name: '诛害',
        type: 'active',
        description:
          '其他角色的结束阶段，若其本回合造成过伤害，你可以对其使用一张【杀】。',
        timings: [GameTiming.PHASE_END],
        effects: [{ action: 'useVirtualCard', params: { as: 'sha' } }],
      },
      {
        id: 'qianxin',
        name: '潜心',
        type: 'awaken',
        description: '觉醒技。当你造成伤害后，若你已受伤，你减 1 点体力上限并获得「荐言」。',
        timings: [GameTiming.AFTER_DAMAGE],
      },
      {
        id: 'jianyan',
        name: '荐言',
        type: 'active',
        description:
          '出牌阶段限一次，你可以声明一种牌的类别或颜色，亮出牌堆顶符合声明的第一张牌并交给一名男性角色。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
        effects: [{ action: 'showCard', params: { declareType: true } }],
      },
    ],
  }),
];
