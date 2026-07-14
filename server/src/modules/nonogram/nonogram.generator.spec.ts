import { describe, expect, it } from 'vitest';
import {
  boardsEqual,
  extractClues,
  generateNonogramPuzzle,
  validateLogicPuzzle,
} from './nonogram.generator';
import {
  enumerateLinePlacements,
  intersectPlacements,
  isLogicallySolvable,
  solveByLogic,
  type LogicCell,
} from './nonogram.solver';

describe('nonogram.solver', () => {
  it('intersects forced blacks for clue [5] on length 5', () => {
    const known: LogicCell[] = ['u', 'u', 'u', 'u', 'u'];
    const placements = enumerateLinePlacements(5, [5], known);
    expect(placements).toHaveLength(1);
    const next = intersectPlacements(placements);
    expect(next).toEqual(['b', 'b', 'b', 'b', 'b']);
  });

  it('solves a forced first-row puzzle without guessing', () => {
    const size = 5;
    const solution = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, () => r === 0),
    );
    const rowClues = solution.map((row) => extractClues(row));
    const colClues = Array.from({ length: size }, (_, col) =>
      extractClues(solution.map((row) => row[col]!)),
    );
    const result = solveByLogic(size, rowClues, colClues);
    expect(result.ok).toBe(true);
    if (result.ok) expect(boardsEqual(result.grid, solution)).toBe(true);
  });

  it('rejects puzzles that need guessing (stuck)', () => {
    // 人为构造：线索过松，无法强制任何格（两行两列全为 [0] 以外的松线索）
    // 2x2 线索全是 [1]，存在多种解，线解无法全盘确定
    const result = solveByLogic(
      2,
      [
        [1],
        [1],
      ],
      [
        [1],
        [1],
      ],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('stuck');
  });
});

describe('nonogram.generator', () => {
  it('extracts consecutive runs', () => {
    expect(extractClues([true, true, false, true])).toEqual([2, 1]);
    expect(extractClues([false, false, false])).toEqual([0]);
    expect(extractClues([true, true, true])).toEqual([3]);
  });

  it('generates logically solvable puzzles for each size', () => {
    for (const size of [5, 8, 10]) {
      const puzzle = generateNonogramPuzzle(size);
      expect(puzzle.solution).toHaveLength(size);
      expect(puzzle.rowClues).toHaveLength(size);
      expect(puzzle.colClues).toHaveLength(size);
      expect(puzzle.digits).toHaveLength(size);
      expect(validateLogicPuzzle(puzzle.solution)).toBe(true);
      expect(
        isLogicallySolvable(size, puzzle.rowClues, puzzle.colClues, puzzle.solution),
      ).toBe(true);

      const minLines = Math.max(2, Math.ceil(size * 0.7));
      const nonEmptyRows = puzzle.rowClues.filter((c) => !(c.length === 1 && c[0] === 0)).length;
      const nonEmptyCols = puzzle.colClues.filter((c) => !(c.length === 1 && c[0] === 0)).length;
      expect(nonEmptyRows).toBeGreaterThanOrEqual(minLines);
      expect(nonEmptyCols).toBeGreaterThanOrEqual(minLines);
    }
  });

  it('rejects sparse boards that leave most lines empty', () => {
    // 10×10 左上角 4×4 色块：大量空行空列
    const size = 10;
    const solution = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => r < 4 && c < 4),
    );
    expect(validateLogicPuzzle(solution)).toBe(false);
  });
});
