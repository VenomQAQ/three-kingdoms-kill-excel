import type { LianliankanTile } from '@tk/shared';

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
