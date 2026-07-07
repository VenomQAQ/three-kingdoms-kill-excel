import type { GameStats } from '@tk/shared';

export type GameStatsKey = 'sanguosha' | 'lianliankan' | 'monopoly';

export type StatsMap = Record<GameStatsKey, GameStats>;

export const ZERO_GAME_STATS: GameStats = { total: 0, wins: 0, losses: 0, winRate: 0 };

export function emptyStatsMap(): StatsMap {
  return {
    sanguosha: { ...ZERO_GAME_STATS },
    lianliankan: { ...ZERO_GAME_STATS },
    monopoly: { ...ZERO_GAME_STATS },
  };
}

export function parseStatsJson(raw: string | null | undefined): StatsMap {
  const base = emptyStatsMap();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<GameStatsKey, Partial<GameStats>>>;
    for (const key of Object.keys(base) as GameStatsKey[]) {
      const item = parsed[key];
      if (!item) continue;
      const total = Number(item.total ?? 0);
      const wins = Number(item.wins ?? 0);
      const losses = Number(item.losses ?? 0);
      base[key] = normalizeStats({ total, wins, losses, winRate: 0 });
    }
  } catch {
    return base;
  }
  return base;
}

export function recordGameResult(raw: string | null | undefined, game: GameStatsKey, won: boolean): string {
  const stats = parseStatsJson(raw);
  const current = stats[game];
  stats[game] = normalizeStats({
    total: current.total + 1,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (won ? 0 : 1),
    winRate: 0,
  });
  return JSON.stringify(stats);
}

function normalizeStats(stats: GameStats): GameStats {
  const total = Math.max(0, Math.trunc(stats.total));
  const wins = Math.max(0, Math.trunc(stats.wins));
  const losses = Math.max(0, Math.trunc(stats.losses));
  return {
    total,
    wins,
    losses,
    winRate: total > 0 ? wins / total : 0,
  };
}
