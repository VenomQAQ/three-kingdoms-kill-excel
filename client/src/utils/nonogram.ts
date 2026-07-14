import type { NonogramCellState } from '@tk/shared';

export const NONOGRAM_RULES_HTML = `
<h4>1. 目标</h4>
<ul>
  <li>开局后棋盘为空表；根据第 1 行、A 列的线索，点选应勾选的格子。</li>
  <li>线索数字表示该行/该列中连续勾选格的长度；多个数字表示多段，中间至少隔 1 个空白。</li>
</ul>
<h4>2. 操作</h4>
<ul>
  <li>点击空白格进行勾选：每次都会立刻校验。</li>
  <li>选对：格子显示 <strong>1</strong>；选错：记一次失误。</li>
  <li>已勾选的格子不可取消。</li>
  <li>当某一行或某一列全部填对后，该行/列会略微变淡并锁定，不可再改。</li>
</ul>
<h4>3. 规则</h4>
<ul>
  <li>每次点「开始」都会消耗 <strong>5 金币</strong>并开一局新题，不限时长。</li>
  <li>简单 / 普通 / 困难对应不同棋盘尺寸与通关奖励。</li>
  <li>最多允许失误 <strong>3</strong> 次，第 4 次错误即挑战失败。</li>
  <li>全部应勾选的格子都正确选满后即通关。</li>
</ul>
`.trim();

/** 根据当前涂色判断某行是否已全部正确（含应空的格保持空） */
export function isLineComplete(
  board: NonogramCellState[][],
  solution: boolean[][],
  axis: 'row' | 'col',
  index: number,
): boolean {
  const size = solution.length;
  for (let i = 0; i < size; i += 1) {
    const r = axis === 'row' ? index : i;
    const c = axis === 'row' ? i : index;
    const shouldFill = Boolean(solution[r]?.[c]);
    const isFilled = board[r]?.[c] === 'filled';
    if (shouldFill !== isFilled) return false;
  }
  return true;
}

export function computeCompletedLines(
  board: NonogramCellState[][],
  solution: boolean[][],
): { rows: boolean[]; cols: boolean[] } {
  const size = solution.length;
  const rows = Array.from({ length: size }, (_, r) => isLineComplete(board, solution, 'row', r));
  const cols = Array.from({ length: size }, (_, c) => isLineComplete(board, solution, 'col', c));
  return { rows, cols };
}

export function isBoardSolved(board: NonogramCellState[][], solution: boolean[][]): boolean {
  const size = solution.length;
  if (board.length !== size) return false;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const shouldFill = Boolean(solution[r]?.[c]);
      const isFilled = board[r]?.[c] === 'filled';
      if (shouldFill !== isFilled) return false;
    }
  }
  return true;
}

export function boardToBool(board: NonogramCellState[][]): boolean[][] {
  return board.map((row) => row.map((cell) => cell === 'filled'));
}

export function createEmptyBoard(size: number): NonogramCellState[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 'empty' as NonogramCellState),
  );
}

export function formatClues(clues: number[]): string {
  return clues.join(' ');
}

export function buildDemoDigits(size: number): number[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ((r * 3 + c * 7) % 9) + 1),
  );
}

/** 演示线索（未开局） */
export function buildDemoClues(size: number): { rowClues: number[][]; colClues: number[][] } {
  const rowClues = Array.from({ length: size }, (_, i) => {
    if (i % 3 === 0) return [Math.max(1, Math.floor(size / 3))];
    if (i % 3 === 1) return [1, 1];
    return [0];
  });
  const colClues = Array.from({ length: size }, (_, i) => {
    if (i % 3 === 0) return [1, Math.max(1, Math.floor(size / 4))];
    if (i % 3 === 1) return [Math.max(1, Math.floor(size / 2))];
    return [0];
  });
  return { rowClues, colClues };
}
