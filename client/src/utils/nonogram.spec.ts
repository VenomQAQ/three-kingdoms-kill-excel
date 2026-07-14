import { describe, expect, it } from 'vitest';
import {
  boardToBool,
  computeCompletedLines,
  createEmptyBoard,
  isBoardSolved,
  isLineComplete,
} from './nonogram';

describe('nonogram utils', () => {
  const solution = [
    [true, true, false],
    [false, true, false],
    [true, false, true],
  ];

  it('detects completed lines', () => {
    const board = createEmptyBoard(3);
    board[0]![0] = 'filled';
    board[0]![1] = 'filled';
    expect(isLineComplete(board, solution, 'row', 0)).toBe(true);
    expect(isLineComplete(board, solution, 'col', 1)).toBe(false);

    board[1]![1] = 'filled';
    expect(isLineComplete(board, solution, 'col', 1)).toBe(true);
  });

  it('detects full solve', () => {
    const board = createEmptyBoard(3);
    board[0]![0] = 'filled';
    board[0]![1] = 'filled';
    board[1]![1] = 'filled';
    board[2]![0] = 'filled';
    board[2]![2] = 'filled';
    expect(isBoardSolved(board, solution)).toBe(true);
    expect(computeCompletedLines(board, solution).rows.every(Boolean)).toBe(true);
    expect(boardToBool(board)).toEqual(solution);
  });
});
