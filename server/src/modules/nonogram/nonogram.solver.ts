/**
 * 数织纯逻辑求解器（无猜测）
 *
 * 对每行/列枚举所有合法摆放，取交集强制填格；反复传播直到：
 * - 全盘确定 → 可纯推理通关
 * - 卡住仍有未知 → 需要猜测
 * - 无合法摆放 → 矛盾
 */

export type LogicCell = 'u' | 'b' | 'w';

export type SolveResult =
  | { ok: true; grid: boolean[][] }
  | { ok: false; reason: 'stuck' | 'contradiction' };

/** 线索 [0] 表示全空 */
export function normalizeClues(clues: number[]): number[] {
  if (clues.length === 1 && clues[0] === 0) return [];
  return clues.filter((n) => n > 0);
}

function lineFitsKnown(line: boolean[], known: LogicCell[]): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const k = known[i]!;
    if (k === 'b' && !line[i]) return false;
    if (k === 'w' && line[i]) return false;
  }
  return true;
}

/**
 * 枚举与线索、已知格一致的所有完整行填法（true=黑）
 * size≤10 时枚举量可接受
 */
export function enumerateLinePlacements(
  length: number,
  clues: number[],
  known: LogicCell[],
): boolean[][] {
  const runs = normalizeClues(clues);
  const results: boolean[][] = [];

  if (runs.length === 0) {
    const empty = Array.from({ length }, () => false);
    if (lineFitsKnown(empty, known)) results.push(empty);
    return results;
  }

  const minAfter = (fromRun: number): number => {
    let sum = 0;
    for (let i = fromRun; i < runs.length; i += 1) {
      sum += runs[i]!;
      if (i > fromRun) sum += 1; // 段间至少一空
    }
    return sum;
  };

  const rec = (runIdx: number, pos: number, line: boolean[]): void => {
    if (runIdx >= runs.length) {
      if (lineFitsKnown(line, known)) results.push(line.slice());
      return;
    }
    const run = runs[runIdx]!;
    const needAfter = runIdx + 1 < runs.length ? 1 + minAfter(runIdx + 1) : 0;
    const maxStart = length - run - needAfter;
    for (let start = pos; start <= maxStart; start += 1) {
      const next = line.slice();
      for (let i = start; i < start + run; i += 1) next[i] = true;
      // 下一段之前强制空一格（用 nextPos 跳过）
      const nextPos = start + run + (runIdx + 1 < runs.length ? 1 : 0);
      rec(runIdx + 1, nextPos, next);
    }
  };

  rec(0, 0, Array.from({ length }, () => false));
  return results;
}

/** 多摆放取交集；无摆放返回 null（矛盾） */
export function intersectPlacements(placements: boolean[][]): LogicCell[] | null {
  if (placements.length === 0) return null;
  const length = placements[0]!.length;
  const out: LogicCell[] = Array.from({ length }, () => 'u');
  for (let i = 0; i < length; i += 1) {
    let allB = true;
    let allW = true;
    for (const p of placements) {
      if (p[i]) allW = false;
      else allB = false;
    }
    if (allB) out[i] = 'b';
    else if (allW) out[i] = 'w';
  }
  return out;
}

function applyLine(
  known: LogicCell[],
  clues: number[],
): { next: LogicCell[]; changed: boolean } | { contradiction: true } {
  const placements = enumerateLinePlacements(known.length, clues, known);
  const deduced = intersectPlacements(placements);
  if (!deduced) return { contradiction: true };

  let changed = false;
  const next = known.slice();
  for (let i = 0; i < known.length; i += 1) {
    if (deduced[i] === 'u') continue;
    if (next[i] === 'u') {
      next[i] = deduced[i]!;
      changed = true;
    } else if (next[i] !== deduced[i]) {
      return { contradiction: true };
    }
  }
  return { next, changed };
}

/** 纯逻辑求解：无猜测传播至全盘或失败 */
export function solveByLogic(
  size: number,
  rowClues: number[][],
  colClues: number[][],
): SolveResult {
  const grid: LogicCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 'u' as LogicCell),
  );

  let changed = true;
  let guard = 0;
  const maxRounds = size * size * 6;

  while (changed && guard < maxRounds) {
    guard += 1;
    changed = false;

    for (let r = 0; r < size; r += 1) {
      const result = applyLine(grid[r]!, rowClues[r]!);
      if ('contradiction' in result) return { ok: false, reason: 'contradiction' };
      if (result.changed) {
        grid[r] = result.next;
        changed = true;
      }
    }

    for (let c = 0; c < size; c += 1) {
      const colKnown = grid.map((row) => row[c]!);
      const result = applyLine(colKnown, colClues[c]!);
      if ('contradiction' in result) return { ok: false, reason: 'contradiction' };
      if (result.changed) {
        for (let r = 0; r < size; r += 1) grid[r]![c] = result.next[r]!;
        changed = true;
      }
    }
  }

  const complete = grid.every((row) => row.every((cell) => cell !== 'u'));
  if (!complete) return { ok: false, reason: 'stuck' };

  return {
    ok: true,
    grid: grid.map((row) => row.map((cell) => cell === 'b')),
  };
}

export function isLogicallySolvable(
  size: number,
  rowClues: number[][],
  colClues: number[][],
  expected?: boolean[][],
): boolean {
  const result = solveByLogic(size, rowClues, colClues);
  if (!result.ok) return false;
  if (!expected) return true;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (result.grid[r]![c] !== Boolean(expected[r]?.[c])) return false;
    }
  }
  return true;
}
