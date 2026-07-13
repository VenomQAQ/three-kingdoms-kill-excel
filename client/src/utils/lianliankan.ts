import type {
  LianliankanConfig,
  LianliankanDifficulty,
  LianliankanTheme,
  LianliankanThemeItem,
  LianliankanTile,
} from '@tk/shared';

export function buildLianliankanItemCatalog(config: LianliankanConfig | null | undefined): Map<string, LianliankanThemeItem> {
  const map = new Map<string, LianliankanThemeItem>();
  if (!config) return map;
  for (const theme of config.themes) {
    for (const item of theme.items) {
      map.set(item.id, item);
    }
  }
  for (const item of config.extraItems ?? []) {
    map.set(item.id, item);
  }
  return map;
}

/** 检测是否为 Windows（用于 emojiWin） */
export function isWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
}

/** 按平台解析展示图标：Win 优先 emojiWin，否则 emoji */
export function resolveLianliankanEmoji(item: Pick<LianliankanThemeItem, 'emoji' | 'emojiWin'>, windows = isWindowsPlatform()): string {
  return windows && item.emojiWin ? item.emojiWin : item.emoji;
}

/** 预览用：与服务端类似的相似权重 / 极难池抽样（非权威，仅 UI） */
export function selectPreviewKindIds(
  config: LianliankanConfig,
  theme: LianliankanTheme,
  difficulty: LianliankanDifficulty,
): string[] {
  const kindCount = Math.max(1, difficulty.kindCount);
  if (difficulty.difficultyId === 'extreme') {
    const catalog = buildLianliankanItemCatalog(config);
    const pools = (config.similarPools ?? [])
      .map((pool) => ({
        ...pool,
        itemIds: pool.itemIds.filter((id) => catalog.has(id)),
      }))
      .filter((pool) => pool.itemIds.length >= 2);
    if (pools.length === 0) return theme.items.map((item) => item.id).slice(0, kindCount);
    // 预览稳定：取第一个够大的池
    const pool = pools.find((entry) => entry.itemIds.length >= Math.min(kindCount, 4)) ?? pools[0]!;
    return pool.itemIds.slice(0, Math.min(kindCount, pool.itemIds.length));
  }

  const allIds = theme.items.map((item) => item.id);
  const target = Math.min(kindCount, allIds.length);
  const weight = Math.min(1, Math.max(0, difficulty.similarGroupWeight));
  if (weight <= 0 || theme.similarGroups.length === 0) {
    return allIds.slice(0, target);
  }

  const selected: string[] = [];
  const used = new Set<string>();
  const similarTarget = weight >= 1 ? target : Math.min(target, Math.round(target * weight));
  for (const group of theme.similarGroups) {
    if (selected.length >= similarTarget) break;
    for (const id of group.itemIds) {
      if (!allIds.includes(id) || used.has(id)) continue;
      selected.push(id);
      used.add(id);
      if (selected.length >= similarTarget) break;
    }
  }
  if (weight < 1) {
    for (const id of allIds) {
      if (selected.length >= target) break;
      if (used.has(id)) continue;
      selected.push(id);
      used.add(id);
    }
  }
  if (selected.length < target) {
    for (const id of allIds) {
      if (selected.length >= target) break;
      if (used.has(id)) continue;
      selected.push(id);
      used.add(id);
    }
  }
  return selected;
}

export function buildDemoBoard(
  itemIds: string[],
  rows: number,
  cols: number,
  kindCount: number,
): LianliankanTile[] {
  const total = rows * cols;
  const selected = itemIds.slice(0, Math.max(1, Math.min(kindCount, itemIds.length)));
  return Array.from({ length: total }, (_, index) => ({
    tileId: `demo-${index}`,
    itemId: selected[index % selected.length]!,
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}

export function formatLianliankanTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function canConnect(board: Map<string, LianliankanTile>, a: LianliankanTile, b: LianliankanTile): boolean {
  if (a.itemId !== b.itemId || a.tileId === b.tileId) return false;
  const rows = Math.max(a.row, b.row, ...Array.from(board.values(), (tile) => tile.row)) + 2;
  const cols = Math.max(a.col, b.col, ...Array.from(board.values(), (tile) => tile.col)) + 2;
  const occupied = new Set(Array.from(board.values(), (tile) => `${tile.row + 1},${tile.col + 1}`));
  const start = { row: a.row + 1, col: a.col + 1, dir: -1, turns: 0 };
  const targetKey = `${b.row + 1},${b.col + 1}`;
  occupied.delete(`${a.row + 1},${a.col + 1}`);
  occupied.delete(targetKey);
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (let dir = 0; dir < dirs.length; dir += 1) {
      const nextTurns = cur.dir === -1 || cur.dir === dir ? cur.turns : cur.turns + 1;
      if (nextTurns > 2) continue;
      const d = dirs[dir]!;
      let row = cur.row + d.dr;
      let col = cur.col + d.dc;
      while (row >= 0 && row <= rows && col >= 0 && col <= cols) {
        const key = `${row},${col}`;
        if (occupied.has(key)) break;
        if (key === targetKey) return true;
        const stateKey = `${key},${dir},${nextTurns}`;
        if (!seen.has(stateKey)) {
          seen.add(stateKey);
          queue.push({ row, col, dir, turns: nextTurns });
        }
        row += d.dr;
        col += d.dc;
      }
    }
  }
  return false;
}
