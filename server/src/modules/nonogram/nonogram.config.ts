import type { NonogramConfig } from '@tk/shared';

/**
 * 数织 · 难度与经济配置（经 GET /api/nonogram/config 下发）
 *
 * - entryFee：每次开局消耗 5 金币
 * - maxMistakes：最多容错 3 次
 * - 不限时长
 * - 题目由 generateNonogramPuzzle 生成：终盘 → 线索 → 纯逻辑求解器验收（无猜测可还原）
 */
export const NONOGRAM_CONFIG: NonogramConfig = {
  defaultDifficultyId: 'easy',
  entryFee: 5,
  maxMistakes: 3,
  difficulties: [
    {
      difficultyId: 'easy',
      name: '简单',
      size: 5,
      entryFee: 5,
      rewardCoins: 8,
    },
    {
      difficultyId: 'normal',
      name: '普通',
      size: 8,
      entryFee: 5,
      rewardCoins: 14,
    },
    {
      difficultyId: 'hard',
      name: '困难',
      size: 10,
      entryFee: 5,
      rewardCoins: 20,
    },
  ],
  _v: 1,
};
