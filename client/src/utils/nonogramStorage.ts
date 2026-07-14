import type { NonogramCellState, NonogramDifficultyId } from '@tk/shared';

const STORAGE_KEY = 'tk_nonogram_progress_v1';

export interface NonogramProgressCache {
  sessionId: string;
  difficultyId: NonogramDifficultyId;
  size: number;
  board: NonogramCellState[][];
  mistakes: number;
  updatedAt: number;
  _v: 1;
}

function isCellState(value: unknown): value is NonogramCellState {
  return value === 'empty' || value === 'filled';
}

function isValidBoard(board: unknown, size: number): board is NonogramCellState[][] {
  if (!Array.isArray(board) || board.length !== size) return false;
  return board.every(
    (row) => Array.isArray(row) && row.length === size && row.every(isCellState),
  );
}

export function loadNonogramProgress(sessionId: string): NonogramProgressCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NonogramProgressCache>;
    if (
      parsed._v !== 1 ||
      parsed.sessionId !== sessionId ||
      typeof parsed.size !== 'number' ||
      typeof parsed.mistakes !== 'number' ||
      !isValidBoard(parsed.board, parsed.size)
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      difficultyId: parsed.difficultyId as NonogramDifficultyId,
      size: parsed.size,
      board: parsed.board,
      mistakes: Math.max(0, Math.floor(parsed.mistakes)),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      _v: 1,
    };
  } catch {
    return null;
  }
}

export function saveNonogramProgress(cache: NonogramProgressCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...cache, updatedAt: Date.now(), _v: 1 }),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearNonogramProgress(sessionId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!sessionId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { sessionId?: string };
    if (parsed.sessionId === sessionId) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
