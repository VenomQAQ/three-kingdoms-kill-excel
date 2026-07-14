import { isLogicallySolvable } from './nonogram.solver';

/** 从一行/一列布尔序列提取连续黑块线索 */
export function extractClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) {
      run += 1;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

export function boardsEqual(a: boolean[][], b: boolean[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r += 1) {
    const rowA = a[r]!;
    const rowB = b[r]!;
    if (!rowB || rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c += 1) {
      if (Boolean(rowA[c]) !== Boolean(rowB[c])) return false;
    }
  }
  return true;
}

function countFilled(grid: boolean[][]): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell) n += 1;
    }
  }
  return n;
}

function emptyGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => false));
}

function densityForSize(size: number): number {
  if (size <= 5) return 0.48;
  if (size <= 8) return 0.44;
  return 0.42;
}

function buildDigits(size: number): number[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.floor(Math.random() * 9) + 1),
  );
}

function cluesFromSolution(solution: boolean[][]): {
  rowClues: number[][];
  colClues: number[][];
} {
  const size = solution.length;
  const rowClues = solution.map((row) => extractClues(row));
  const colClues = Array.from({ length: size }, (_, col) =>
    extractClues(solution.map((row) => row[col]!)),
  );
  return { rowClues, colClues };
}

function isEmptyClue(clue: number[]): boolean {
  return clue.length === 1 && clue[0] === 0;
}

/**
 * 拒绝「大半行/列全空」的稀疏盘：否则 10×10 会缩成一小块有效区域，
 * 且空行空列开局即判定完成并锁灰。
 */
function isInteresting(rowClues: number[][], colClues: number[][]): boolean {
  const size = rowClues.length;
  if (size === 0 || colClues.length !== size) return false;

  const nonEmptyRows = rowClues.filter((c) => !isEmptyClue(c)).length;
  const nonEmptyCols = colClues.filter((c) => !isEmptyClue(c)).length;
  // 至少约 70% 的行、列要有黑块，避免有效区域明显小于宣称尺寸
  const minLines = Math.max(2, Math.ceil(size * 0.7));
  return nonEmptyRows >= minLines && nonEmptyCols >= minLines;
}

/** 策略 A：独立伯努利随机格 */
function candidateRandom(size: number, density: number): boolean[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.random() < density),
  );
}

/** 策略 B：若干随机矩形色块（更易产生可线解题），强制覆盖大部分行列 */
function candidateRectangles(size: number): boolean[][] {
  const grid = emptyGrid(size);
  const blocks = 3 + Math.floor(Math.random() * Math.max(3, Math.floor(size / 2)));
  for (let i = 0; i < blocks; i += 1) {
    const h = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(size * 0.6)));
    const w = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(size * 0.6)));
    const r0 = Math.floor(Math.random() * (size - h + 1));
    const c0 = Math.floor(Math.random() * (size - w + 1));
    for (let r = r0; r < r0 + h; r += 1) {
      for (let c = c0; c < c0 + w; c += 1) {
        grid[r]![c] = true;
      }
    }
  }
  return grid;
}

/** 策略 C：横竖笔画（连续 run），接近手绘图案 */
function candidateStrokes(size: number): boolean[][] {
  const grid = emptyGrid(size);
  const strokes = size + Math.floor(Math.random() * size);
  for (let i = 0; i < strokes; i += 1) {
    const horizontal = Math.random() < 0.5;
    const len = 1 + Math.floor(Math.random() * Math.max(1, size - 1));
    if (horizontal) {
      const r = Math.floor(Math.random() * size);
      const c0 = Math.floor(Math.random() * (size - len + 1));
      for (let c = c0; c < c0 + len; c += 1) grid[r]![c] = true;
    } else {
      const c = Math.floor(Math.random() * size);
      const r0 = Math.floor(Math.random() * (size - len + 1));
      for (let r = r0; r < r0 + len; r += 1) grid[r]![c] = true;
    }
  }
  return grid;
}

/** 策略 D：稀疏种子再膨胀一圈（制造连贯块） */
function candidateBlob(size: number): boolean[][] {
  const grid = candidateRandom(size, 0.22);
  const next = emptyGrid(size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!grid[r]![c]) continue;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) next[rr]![cc] = true;
        }
      }
    }
  }
  return next;
}

/** 始终可线解的兜底：首行全黑，其余全白 */
function fallbackForcedRow(size: number): boolean[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, () => r === 0),
  );
}

function fallbackPlus(size: number): boolean[][] {
  const mid = Math.floor(size / 2);
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => r === mid || c === mid),
  );
}

function fallbackFrame(size: number): boolean[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => r === 0 || c === 0 || r === size - 1 || c === size - 1),
  );
}

function fallbackDiagonal(size: number): boolean[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => r === c),
  );
}

function pickCandidate(size: number, attempt: number): boolean[][] {
  const density = densityForSize(size);
  const mode = attempt % 4;
  if (mode === 0) return candidateRandom(size, density);
  if (mode === 1) return candidateRectangles(size);
  if (mode === 2) return candidateStrokes(size);
  return candidateBlob(size);
}

function acceptDensity(size: number, grid: boolean[][]): boolean {
  const filled = countFilled(grid);
  const minFilled = Math.max(2, Math.floor(size * size * 0.18));
  const maxFilled = Math.floor(size * size * 0.72);
  return filled >= minFilled && filled <= maxFilled;
}

/**
 * 验证：线索由终盘反推，且纯逻辑求解器能无猜还原到该终盘
 */
export function validateLogicPuzzle(solution: boolean[][]): boolean {
  const size = solution.length;
  const { rowClues, colClues } = cluesFromSolution(solution);
  if (!isInteresting(rowClues, colClues)) return false;
  return isLogicallySolvable(size, rowClues, colClues, solution);
}

function buildVerifiedFallback(size: number): boolean[][] {
  const templates = [
    () => fallbackForcedRow(size),
    () => fallbackPlus(size),
    () => fallbackFrame(size),
    () => fallbackDiagonal(size),
  ];
  for (const make of templates) {
    const grid = make();
    if (validateLogicPuzzle(grid)) return grid;
  }
  return fallbackForcedRow(size);
}

export interface NonogramPuzzle {
  solution: boolean[][];
  rowClues: number[][];
  colClues: number[][];
  digits: number[][];
}

/**
 * Generate–and–Test：
 * 重复生成候选终盘 → 反推线索 → 纯逻辑求解器验收
 * 直到唯一可无猜还原，否则回退到已验证模板
 */
export function generateNonogramPuzzle(size: number, maxAttempts = 120): NonogramPuzzle {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solution = pickCandidate(size, attempt);
    if (!acceptDensity(size, solution)) continue;
    if (!validateLogicPuzzle(solution)) continue;

    const { rowClues, colClues } = cluesFromSolution(solution);
    return {
      solution,
      rowClues,
      colClues,
      digits: buildDigits(size),
    };
  }

  const solution = buildVerifiedFallback(size);
  const { rowClues, colClues } = cluesFromSolution(solution);
  return {
    solution,
    rowClues,
    colClues,
    digits: buildDigits(size),
  };
}
