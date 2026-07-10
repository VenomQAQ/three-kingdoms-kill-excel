import type { CrimeSudokuDisplayMode, CrimeSudokuLevel } from '@tk/shared';

/** v2：校验盘面尺寸/取值，避免旧脏进度（如 9×9 串进 6×6） */
const PROGRESS_KEY = 'tk_crime_sudoku_progress_v2';
const NOTES_KEY = 'tk_crime_sudoku_notes_v2';
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

/** 本地进度是否与关卡配置兼容（尺寸、取值范围、题面给定格） */
export function isCrimeSudokuProgressValid(
  level: CrimeSudokuLevel,
  progress: CrimeSudokuLocalProgress | null | undefined,
): boolean {
  if (!progress || progress.levelId !== level.id) return false;
  if (!Array.isArray(progress.board) || progress.board.length !== level.size) return false;
  if (!Array.isArray(progress.notes) || progress.notes.length !== level.size) return false;
  for (let r = 0; r < level.size; r += 1) {
    const row = progress.board[r];
    const noteRow = progress.notes[r];
    if (!Array.isArray(row) || row.length !== level.size) return false;
    if (!Array.isArray(noteRow) || noteRow.length !== level.size) return false;
    for (let c = 0; c < level.size; c += 1) {
      const v = row[c] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > level.size) return false;
      const g = level.given[r]![c]!;
      if (g !== 0 && v !== g) return false;
      const notes = noteRow[c];
      if (!Array.isArray(notes)) return false;
      if (notes.some((n) => !Number.isInteger(n) || n < 1 || n > level.size)) return false;
    }
  }
  if (progress.accused != null) {
    if (!Number.isInteger(progress.accused) || progress.accused < 1 || progress.accused > level.size) {
      return false;
    }
  }
  return true;
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
