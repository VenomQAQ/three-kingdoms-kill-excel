import { describe, expect, it } from 'vitest';
import {
  enumerateLinePlacements,
  intersectPlacements,
  solveByLogic,
  type LogicCell,
} from './nonogram.solver';
import { extractClues } from './nonogram.generator';

describe('nonogram.solver line cases', () => {
  it('forces empty line for clue [0]', () => {
    const known: LogicCell[] = ['u', 'u', 'u'];
    const placements = enumerateLinePlacements(3, [0], known);
    expect(placements).toEqual([[false, false, false]]);
    expect(intersectPlacements(placements)).toEqual(['w', 'w', 'w']);
  });

  it('solves plus pattern on 5x5', () => {
    const size = 5;
    const mid = 2;
    const solution = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => r === mid || c === mid),
    );
    const rowClues = solution.map((row) => extractClues(row));
    const colClues = Array.from({ length: size }, (_, col) =>
      extractClues(solution.map((row) => row[col]!)),
    );
    const result = solveByLogic(size, rowClues, colClues);
    expect(result.ok).toBe(true);
  });
});
