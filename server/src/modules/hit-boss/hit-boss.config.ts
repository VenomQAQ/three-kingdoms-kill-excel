import type { HitBossConfig } from '@tk/shared';

/**
 * 打老板 · 难度与经济配置（经 GET /api/hit-boss/config 下发）
 *
 * 难度项说明：
 * - difficultyId / name：档位 id 与展示名
 * - rows / cols：游戏表格行数、列数（可点击范围）
 * - timeLimitSec：本局初始时限（秒）
 * - bossTarget：通关需打到的「老板」数量
 * - entryFee：本档入场费（金币）；实际扣费以全局 entryFee 为准
 * - rewardCoins：通关奖励金币
 * - spawnIntervalMs：生成间隔（毫秒），越小出现越频繁
 * - bossWeight：抽到「老板」的权重
 * - distractorWeight：抽到干扰项（摸鱼/玩游戏/偷吃/看小说）的总权重
 * - workWeight：抽到「打工」的权重（打到立刻失败；宜保持较低）
 *   ※ 三类权重会在运行时归一化，相对大小决定出现比例
 */
export const HIT_BOSS_CONFIG: HitBossConfig = {
  difficulties: [
    {
      difficultyId: 'easy',
      name: '简单',
      rows: 8,
      cols: 8,
      timeLimitSec: 60,
      bossTarget: 18,
      entryFee: 5,
      rewardCoins: 10,
      spawnIntervalMs: 700,
      bossWeight: 0.75,
      distractorWeight: 0.2,
      workWeight: 0.05,
    },
    {
      difficultyId: 'normal',
      name: '普通',
      rows: 10,
      cols: 10,
      timeLimitSec: 75,
      bossTarget: 25,
      entryFee: 5,
      rewardCoins: 18,
      spawnIntervalMs: 550,
      bossWeight: 0.62,
      distractorWeight: 0.3,
      workWeight: 0.08,
    },
    {
      difficultyId: 'hard',
      name: '困难',
      rows: 12,
      cols: 12,
      timeLimitSec: 90,
      bossTarget: 38,
      entryFee: 5,
      rewardCoins: 32,
      spawnIntervalMs: 420,
      bossWeight: 0.52,
      distractorWeight: 0.35,
      workWeight: 0.13,
    },
  ],
  /** 打开 sheet 时默认选中的难度 */
  defaultDifficultyId: 'easy',
  /** 每次开局扣除的金币 */
  entryFee: 5,
  /** 使用一次「延长器」扣除的金币 */
  extendFee: 5,
  /** 每次延长器增加的秒数 */
  extendSec: 15,
  /** 单局最多可使用延长器的次数 */
  maxExtends: 3,
  /** 单局最多可打中的非老板数；超过则失败（允许打中 maxMissHits 个） */
  maxMissHits: 3,
  /** 「老板」未点击时最长存活时间（毫秒），不超过 2s */
  bossMaxLifetimeMs: 2000,
  /** 「老板」未点击时最短存活时间（毫秒） */
  bossMinLifetimeMs: 600,
  _v: 1,
};
