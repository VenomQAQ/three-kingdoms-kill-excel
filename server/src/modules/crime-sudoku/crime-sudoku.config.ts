/** 服务端关卡元数据（奖励/提示）；完整盘面在客户端配置 */
export const CRIME_SUDOKU_SERVER_LEVELS = [
  {
    id: 'lv1',
    name: '第 1 关 · 客栈夜杀',
    difficulty: '入门',
    size: 6,
    rewardCoins: 15,
    maxHints: 3,
    hintCost: 5,
  },
  {
    id: 'lv2',
    name: '第 2 关 · 修车铺夜案',
    difficulty: '入门',
    size: 6,
    rewardCoins: 20,
    maxHints: 3,
    hintCost: 5,
  },
  {
    id: 'lv3',
    name: '第 3 关 · 花坊晨杀',
    difficulty: '进阶',
    size: 6,
    rewardCoins: 25,
    maxHints: 3,
    hintCost: 5,
  },
  {
    id: 'lv4',
    name: '第 4 关 · 府衙签押',
    difficulty: '进阶',
    size: 9,
    rewardCoins: 30,
    maxHints: 3,
    hintCost: 5,
  },
  {
    id: 'lv5',
    name: '第 5 关 · 海滨溺亡',
    difficulty: '进阶',
    size: 6,
    rewardCoins: 25,
    maxHints: 3,
    hintCost: 5,
  },
] as const;

export const CRIME_SUDOKU_HINT_COST = 5;
export const CRIME_SUDOKU_MAX_HINTS = 3;
