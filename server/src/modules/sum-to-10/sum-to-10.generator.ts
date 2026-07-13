import { ulid } from 'ulid';
import type { SumTo10Cell } from '@tk/shared';

function randomDigit(): number {
  return Math.floor(Math.random() * 9) + 1;
}

/** 检查棋盘上是否至少存在一个矩形区域，其数字之和为 10 */
function hasRectSumTen(values: number[][], rows: number, cols: number): boolean {
  for (let r1 = 0; r1 < rows; r1 += 1) {
    for (let c1 = 0; c1 < cols; c1 += 1) {
      for (let r2 = r1; r2 < rows; r2 += 1) {
        for (let c2 = c1; c2 < cols; c2 += 1) {
          let sum = 0;
          for (let r = r1; r <= r2; r += 1) {
            for (let c = c1; c <= c2; c += 1) {
              sum += values[r]![c]!;
            }
          }
          if (sum === 10) return true;
        }
      }
    }
  }
  return false;
}

export function buildSumTo10Board(rows: number, cols: number): SumTo10Cell[] {
  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const values: number[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => randomDigit()),
    );
    if (hasRectSumTen(values, rows, cols)) {
      const cells: SumTo10Cell[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          cells.push({
            cellId: ulid(),
            value: values[row]![col]!,
            row,
            col,
          });
        }
      }
      return cells;
    }
  }

  // 兜底：左上角 1+9 保证可玩
  const values: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => randomDigit()),
  );
  if (rows > 0 && cols > 0) {
    values[0]![0] = 1;
    if (cols > 1) values[0]![1] = 9;
    else if (rows > 1) values[1]![0] = 9;
  }
  return Array.from({ length: rows * cols }, (_, index) => ({
    cellId: ulid(),
    value: values[Math.floor(index / cols)]![index % cols]!,
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}
