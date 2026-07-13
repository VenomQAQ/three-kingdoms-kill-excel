import type { SumTo10Config } from '@tk/shared';

/**
 * 合10 · 难度与经济配置（经 GET /api/sum-to-10/config 下发）
 *
 * - entryFee：每次开局消耗金币（全局 5）
 * - difficulties：普通 / 困难两档，时长相同，目标分与奖励不同
 */
export const SUM_TO_10_CONFIG: SumTo10Config = {
  defaultDifficultyId: 'normal',
  entryFee: 5,
  difficulties: [
    {
      difficultyId: 'normal',
      name: '普通',
      rows: 12,
      cols: 12,
      targetScore: 50,
      timeLimitSec: 120,
      entryFee: 5,
      rewardCoins: 10,
    },
    {
      difficultyId: 'hard',
      name: '困难',
      rows: 12,
      cols: 12,
      targetScore: 80,
      timeLimitSec: 120,
      entryFee: 5,
      rewardCoins: 20,
    },
  ],
  _v: 1,
};
