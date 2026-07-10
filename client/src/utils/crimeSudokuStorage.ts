import type { CrimeSudokuDisplayMode } from '@tk/shared';

const PROGRESS_KEY = 'tk_crime_sudoku_progress';
const NOTES_KEY = 'tk_crime_sudoku_notes';
const DISPLAY_MODE_KEY = 'tk_crime_sudoku_display_mode';

export interface CrimeSudokuLocalProgress {
  levelId: string;
  board: number[][];
  notes: number[][][];
  accused: number | null;
  usedClues: number[];
  hintsUsed: number;
  startedAt: number;
  /** 累计已计时毫秒（切走/刷新前冻结） */
  elapsedMs: number;
  /** 上次开始计时的墙钟时间；playing 时用于续算 */
  timerStartedAt: number | null;
  status: 'playing' | 'cleared';
  /** 本局是否已领取过首次通关奖励（本地标记，服务端另有权威记录） */
  rewardClaimedLocally: boolean;
  updatedAt: number;
}

export type CrimeSudokuProgressMap = Record<string, CrimeSudokuLocalProgress>;
export type CrimeSudokuNotesMap = Record<string, number[][][]>;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCrimeSudokuProgressMap(): CrimeSudokuProgressMap {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(PROGRESS_KEY), {});
}

export function saveCrimeSudokuProgress(progress: CrimeSudokuLocalProgress): void {
  if (typeof window === 'undefined') return;
  const map = loadCrimeSudokuProgressMap();
  map[progress.levelId] = { ...progress, updatedAt: Date.now() };
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

export function clearCrimeSudokuProgress(levelId: string): void {
  if (typeof window === 'undefined') return;
  const map = loadCrimeSudokuProgressMap();
  delete map[levelId];
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

export function loadCrimeSudokuNotesMap(): CrimeSudokuNotesMap {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(NOTES_KEY), {});
}

export function saveCrimeSudokuNotes(levelId: string, notes: number[][][]): void {
  if (typeof window === 'undefined') return;
  const map = loadCrimeSudokuNotesMap();
  map[levelId] = notes;
  window.localStorage.setItem(NOTES_KEY, JSON.stringify(map));
}

export function loadCrimeSudokuDisplayMode(): CrimeSudokuDisplayMode {
  if (typeof window === 'undefined') return 'text';
  const raw = window.localStorage.getItem(DISPLAY_MODE_KEY);
  return raw === 'icon' ? 'icon' : 'text';
}

export function saveCrimeSudokuDisplayMode(mode: CrimeSudokuDisplayMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISPLAY_MODE_KEY, mode);
}

/** 当前累计用时（含正在走的一段） */
export function computeElapsedMs(progress: Pick<CrimeSudokuLocalProgress, 'elapsedMs' | 'timerStartedAt' | 'status'>): number {
  if (progress.status !== 'playing' || progress.timerStartedAt == null) {
    return progress.elapsedMs;
  }
  return progress.elapsedMs + Math.max(0, Date.now() - progress.timerStartedAt);
}

export function formatCrimeSudokuTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
