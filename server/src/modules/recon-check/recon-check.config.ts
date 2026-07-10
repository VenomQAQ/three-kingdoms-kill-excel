import type { ReconCheckConfig } from '@tk/shared';

/**
 * 对账校验（找不同）· 难度与经济配置（经 GET /api/recon-check/config 下发）
 *
 * 难度项说明：
 * - rows / cols：单侧表格行数、列数（左右各一块，中间隔 1 空白列）
 * - rounds：本局轮次数
 * - diffsPerRound：每轮需找出的差异格数（随难度升高）
 * - timeLimitSec：整局时限（秒）
 * - entryFee / rewardCoins：入场费与通关奖励（实际扣费以全局 entryFee 为准）
 */
export const RECON_CHECK_CONFIG: ReconCheckConfig = {
  difficulties: [
    {
      difficultyId: 'easy',
      name: '简单',
      rows: 6,
      cols: 5,
      rounds: 3,
      diffsPerRound: 3,
      timeLimitSec: 120,
      entryFee: 5,
      rewardCoins: 10,
    },
    {
      difficultyId: 'normal',
      name: '普通',
      rows: 8,
      cols: 6,
      rounds: 5,
      diffsPerRound: 5,
      timeLimitSec: 180,
      entryFee: 5,
      rewardCoins: 16,
    },
    {
      difficultyId: 'hard',
      name: '困难',
      rows: 10,
      cols: 7,
      rounds: 7,
      diffsPerRound: 8,
      timeLimitSec: 240,
      entryFee: 5,
      rewardCoins: 28,
    },
  ],
  defaultDifficultyId: 'easy',
  entryFee: 5,
  maxWrongClicks: 3,
  /** 延长器：每次 5 金币，增加 15 秒 */
  extendFee: 5,
  extendSec: 15,
  /** 单局最多使用延长器次数 */
  maxExtends: 3,
  _v: 1,
};
