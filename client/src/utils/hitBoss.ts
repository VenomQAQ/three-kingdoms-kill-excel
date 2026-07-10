import type { HitBossDifficulty, HitBossSpawnKind } from '@tk/shared';

export interface HitBossSpawn {
  id: string;
  kind: HitBossSpawnKind;
  row: number;
  col: number;
  createdAt: number;
  expiresAt: number;
}

export const HIT_BOSS_LABELS: Record<HitBossSpawnKind, string> = {
  boss: '老板',
  slack: '摸鱼',
  game: '玩游戏',
  snack: '偷吃',
  novel: '看小说',
  work: '打工',
};

export const HIT_BOSS_ICONS: Record<HitBossSpawnKind, string> = {
  boss: '👿',
  slack: '🐟',
  game: '🎮',
  snack: '🍪',
  novel: '📖',
  work: '💻',
};

export const HIT_BOSS_RULES_HTML = `
<h4>目标</h4>
<p>在时限内点击足够数量的「老板」，即可通关并获得金币奖励。</p>
<h4>会出现什么</h4>
<ul>
  <li><strong>老板</strong>：要点的目标；不点也会在约 0.4～2 秒内自行消失。</li>
  <li><strong>摸鱼 / 玩游戏 / 偷吃 / 看小说</strong>：干扰项，点到算失误。</li>
  <li><strong>打工</strong>：禁点项，点到立刻失败。</li>
</ul>
<h4>图标模式对照</h4>
<ul>
  <li>👿 = 老板</li>
  <li>🐟 = 摸鱼</li>
  <li>🎮 = 玩游戏</li>
  <li>🍪 = 偷吃</li>
  <li>📖 = 看小说</li>
  <li>💻 = 打工</li>
</ul>
<h4>失败条件</h4>
<ul>
  <li>点到「打工」</li>
  <li>干扰项累计超过 3 个</li>
  <li>时间耗尽仍未打够老板</li>
</ul>
<h4>费用</h4>
<ul>
  <li>每次开局消耗 5 金币</li>
  <li>「延长器」每次 5 金币，增加 15 秒，单局最多 3 次</li>
</ul>
<h4>提示</h4>
<p>难度越高，表格越大、目标越多、干扰与打工更频繁。可用「图标 / 文字」切换展示方式。</p>
`;

const DISTRACTORS: HitBossSpawnKind[] = ['slack', 'game', 'snack', 'novel'];

export function formatHitBossTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** 生成数字底表（伪装成表格数据） */
export function buildNumberBoard(rows: number, cols: number, seed = Date.now()): number[][] {
  let x = seed >>> 0;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) % 100;
  };
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => next()),
  );
}

function pickDistractor(): HitBossSpawnKind {
  return DISTRACTORS[Math.floor(Math.random() * DISTRACTORS.length)]!;
}

/**
 * 按权重抽种类；当剩余时间不足以自然刷够老板时强制出老板。
 */
export function pickSpawnKind(
  difficulty: Pick<HitBossDifficulty, 'bossWeight' | 'distractorWeight' | 'workWeight' | 'spawnIntervalMs'>,
  opts: {
    remainingMs: number;
    bossesSpawned: number;
    bossTarget: number;
    bossMinLifetimeMs: number;
    bossMaxLifetimeMs: number;
  },
): HitBossSpawnKind {
  const remainingBosses = Math.max(0, opts.bossTarget - opts.bossesSpawned);
  if (remainingBosses <= 0) {
    return weightedPick(difficulty.bossWeight * 0.15, difficulty.distractorWeight, difficulty.workWeight);
  }

  const avgLifetime = (opts.bossMinLifetimeMs + opts.bossMaxLifetimeMs) / 2;
  const neededMs = remainingBosses * difficulty.spawnIntervalMs + avgLifetime;
  if (opts.remainingMs <= neededMs * 1.15) {
    return 'boss';
  }

  // 剩余目标偏紧时抬高老板权重
  const urgency = Math.min(1, remainingBosses / Math.max(1, opts.remainingMs / difficulty.spawnIntervalMs));
  const bossW = difficulty.bossWeight + urgency * 0.35;
  return weightedPick(bossW, difficulty.distractorWeight * (1 - urgency * 0.4), difficulty.workWeight);
}

function weightedPick(bossW: number, distractorW: number, workW: number): HitBossSpawnKind {
  const total = Math.max(0.0001, bossW + distractorW + workW);
  const r = Math.random() * total;
  if (r < bossW) return 'boss';
  if (r < bossW + distractorW) return pickDistractor();
  return 'work';
}

export function randomLifetimeMs(minMs: number, maxMs: number): number {
  const lo = Math.max(1, minMs);
  const hi = Math.max(lo, maxMs);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function createSpawn(
  kind: HitBossSpawnKind,
  rows: number,
  cols: number,
  occupied: Set<string>,
  now: number,
  lifetimeMs: number,
): HitBossSpawn | null {
  const free: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = `${row},${col}`;
      if (!occupied.has(key)) free.push({ row, col });
    }
  }
  if (free.length === 0) return null;
  const cell = free[Math.floor(Math.random() * free.length)]!;
  return {
    id: `hb-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    row: cell.row,
    col: cell.col,
    createdAt: now,
    expiresAt: now + lifetimeMs,
  };
}

export function isMissKind(kind: HitBossSpawnKind): boolean {
  return kind !== 'boss' && kind !== 'work';
}
