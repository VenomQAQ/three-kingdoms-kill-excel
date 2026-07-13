import type { SumTo10Cell } from '@tk/shared';

const DEMO_VALUES = [
  [3, 5, 2, 7, 1, 4, 6, 8, 9, 2],
  [1, 9, 4, 3, 6, 2, 5, 7, 8, 3],
  [2, 4, 6, 1, 8, 5, 3, 9, 7, 4],
  [5, 3, 7, 2, 9, 1, 8, 4, 6, 5],
  [8, 2, 1, 6, 4, 7, 9, 3, 5, 1],
  [4, 6, 9, 5, 3, 8, 2, 1, 7, 6],
  [7, 1, 3, 8, 2, 9, 4, 6, 5, 8],
  [6, 8, 5, 9, 7, 3, 1, 2, 4, 9],
];

export function buildDemoBoard(rows: number, cols: number): SumTo10Cell[] {
  const cells: SumTo10Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const demoRow = DEMO_VALUES[row % DEMO_VALUES.length]!;
      cells.push({
        cellId: `demo-${row}-${col}`,
        value: demoRow[col % demoRow.length]!,
        row,
        col,
      });
    }
  }
  return cells;
}

export function formatSumTo10Time(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function randomDigit(): number {
  return Math.floor(Math.random() * 9) + 1;
}

/** 框选矩形内仍有数字的格子（已消除的空白格不计入） */
export function getRectCells(
  cells: SumTo10Cell[],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): SumTo10Cell[] {
  const minR = Math.min(r1, r2);
  const maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2);
  const maxC = Math.max(c1, c2);
  return cells.filter(
    (cell) =>
      cell.value > 0
      && cell.row >= minR
      && cell.row <= maxR
      && cell.col >= minC
      && cell.col <= maxC,
  );
}

export function sumCells(selected: SumTo10Cell[]): number {
  return selected.reduce((acc, cell) => acc + cell.value, 0);
}

export function isCellInRect(
  row: number,
  col: number,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): boolean {
  const minR = Math.min(r1, r2);
  const maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2);
  const maxC = Math.max(c1, c2);
  return row >= minR && row <= maxR && col >= minC && col <= maxC;
}

export const SUM_TO_10_RULES_HTML = `
<h4>目标</h4>
<p>在限定时间内，通过框选数字使之和恰好为 10 来消除得分。达到目标分后仍可继续玩到时间结束，时间到时若已达标即通关。</p>
<h4>怎么玩</h4>
<ul>
  <li>按住鼠标拖拽，框选一个矩形区域（空白格也可作为起点）。</li>
  <li>区域内所有数字之和<strong>正好等于 10</strong>时，松开鼠标即可消除。</li>
  <li>每消除 1 个数字得 1 分（2 个数字凑 10 得 2 分，3 个得 3 分，以此类推）。</li>
  <li>消除后该格变为空白，可继续框选其它数字。</li>
  <li>达到目标分后不会立刻结束，可继续得分，直到时间耗尽再结算。</li>
</ul>
<h4>难度与奖励</h4>
<ul>
  <li><strong>普通</strong>：12×12，目标 50 分，120 秒，通关 +10 金币</li>
  <li><strong>困难</strong>：12×12，目标 80 分，120 秒，通关 +20 金币</li>
</ul>
<h4>费用</h4>
<ul>
  <li>每次开局消耗 <strong>5 金币</strong></li>
  <li>时间结束时未达目标分算失败，不返还入场费</li>
</ul>
`;
