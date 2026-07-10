import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CrimeSudokuClearRecord, CrimeSudokuDisplayMode, CrimeSudokuLevel } from '@tk/shared';
import { CrimeSudokuApi } from '../../api/crimeSudoku';
import { HttpError } from '../../api/http';
import { COL_LABELS } from '../../data/decoy';
import { CRIME_SUDOKU_LEVELS, getCrimeSudokuLevel } from '../../data/crimeSudoku/levels';
import {
  checkWin,
  cloneBoard,
  cloneNotes,
  CRIME_SUDOKU_RULES_HTML,
  emptyNotes,
  filledCount,
  recomputeErrors,
  roomWalls,
  sceneAt,
} from '../../utils/crimeSudoku';
import {
  clearCrimeSudokuProgress,
  computeElapsedMs,
  formatCrimeSudokuTime,
  loadCrimeSudokuDisplayMode,
  loadCrimeSudokuNotesMap,
  loadCrimeSudokuProgressMap,
  saveCrimeSudokuDisplayMode,
  saveCrimeSudokuNotes,
  saveCrimeSudokuProgress,
  type CrimeSudokuLocalProgress,
} from '../../utils/crimeSudokuStorage';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

const BOARD_ORIGIN = { row: 2, col: 1 }; // B3
const TITLE_ROWS = 2;
const CELL_SIZE = 64;

interface CrimeSudokuGridProps {
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onCellDetail?: (text: string) => void;
  onRequireLogin: () => void;
  onWalletUpdate?: (wallet: { coins: number; experience: number; level: number }) => void;
  onToast?: (message: string) => void;
}

function cellRef(row: number, col: number): string {
  return `${COL_LABELS[col] ?? `C${col + 1}`}${row + 1}`;
}

function createFreshProgress(level: CrimeSudokuLevel): CrimeSudokuLocalProgress {
  const now = Date.now();
  return {
    levelId: level.id,
    board: cloneBoard(level.given),
    notes: emptyNotes(level.size),
    accused: null,
    usedClues: [],
    hintsUsed: 0,
    startedAt: now,
    elapsedMs: 0,
    timerStartedAt: now,
    status: 'playing',
    rewardClaimedLocally: false,
    updatedAt: now,
  };
}

export function CrimeSudokuGrid({
  selectedCell,
  isAuthed,
  coins,
  onSelectCell,
  onCellDetail,
  onRequireLogin,
  onWalletUpdate,
  onToast,
}: CrimeSudokuGridProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [levelId, setLevelId] = useState(CRIME_SUDOKU_LEVELS[0]!.id);
  const [displayMode, setDisplayMode] = useState<CrimeSudokuDisplayMode>(() => loadCrimeSudokuDisplayMode());
  const [noteMode, setNoteMode] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const [notice, setNotice] = useState('格子里是场景；数字 = 站在该格的人');
  const [noticeType, setNoticeType] = useState<'info' | 'ok' | 'err'>('info');
  const [clears, setClears] = useState<CrimeSudokuClearRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<{ r: number; c: number } | null>({ r: 0, c: 0 });
  const [levelSelectKey, setLevelSelectKey] = useState(0);

  const [progress, setProgress] = useState<CrimeSudokuLocalProgress>(() => {
    const map = loadCrimeSudokuProgressMap();
    const level = CRIME_SUDOKU_LEVELS[0]!;
    const saved = map[level.id];
    if (saved && saved.status === 'playing') {
      return {
        ...saved,
        timerStartedAt: Date.now(),
      };
    }
    const notesMap = loadCrimeSudokuNotesMap();
    const fresh = createFreshProgress(level);
    if (notesMap[level.id]) fresh.notes = notesMap[level.id]!;
    return fresh;
  });

  const level = useMemo(
    () => getCrimeSudokuLevel(levelId) ?? CRIME_SUDOKU_LEVELS[0]!,
    [levelId],
  );

  const givenMask = useMemo(
    () => level.given.map((row) => row.map((n) => n !== 0)),
    [level],
  );

  const errors = useMemo(
    () => recomputeErrors(progress.board, level.size, level.box),
    [progress.board, level.size, level.box],
  );

  const alreadyCleared = clears.some((item) => item.levelId === level.id);
  const clearRecord = clears.find((item) => item.levelId === level.id);
  const isPlaying = progress.status === 'playing';
  const elapsedMs = isPlaying
    ? computeElapsedMs({ ...progress, timerStartedAt: progress.timerStartedAt })
    : progress.elapsedMs;

  const dataRows = TITLE_ROWS + level.size;
  const dataCols = BOARD_ORIGIN.col + level.size + 2;
  // 标题行较矮，按加权行数估算 filler，避免空白过多/过少
  const weightedRows = TITLE_ROWS * 0.4 + level.size;
  const filler = useCellFiller(wrapRef, weightedRows, dataCols, CELL_SIZE, CELL_SIZE);
  const fillerRows = Math.max(0, Math.ceil(filler.rows));
  const cols = useMemo(
    () => Array.from({ length: dataCols + filler.cols }, (_, i) => COL_LABELS[i] ?? `C${i + 1}`),
    [dataCols, filler.cols],
  );
  const totalRows = dataRows + fillerRows;

  const persist = useCallback((next: CrimeSudokuLocalProgress) => {
    saveCrimeSudokuProgress(next);
    saveCrimeSudokuNotes(next.levelId, next.notes);
  }, []);

  const freezeTimer = useCallback((current: CrimeSudokuLocalProgress): CrimeSudokuLocalProgress => {
    if (current.status !== 'playing' || current.timerStartedAt == null) return current;
    return {
      ...current,
      elapsedMs: computeElapsedMs(current),
      timerStartedAt: null,
    };
  }, []);

  const resumeTimer = useCallback((current: CrimeSudokuLocalProgress): CrimeSudokuLocalProgress => {
    if (current.status !== 'playing') return current;
    return { ...current, timerStartedAt: Date.now() };
  }, []);

  // 切走 / 刷新 / 关闭：冻结并保存
  useEffect(() => {
    const flush = () => {
      setProgress((prev) => {
        const frozen = freezeTimer(prev);
        persist(frozen);
        return frozen;
      });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
      else {
        setProgress((prev) => {
          if (prev.status !== 'playing') return prev;
          const resumed = resumeTimer(prev);
          persist(resumed);
          return resumed;
        });
      }
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [freezeTimer, persist, resumeTimer]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    if (!isAuthed) return;
    void CrimeSudokuApi.getProgress()
      .then((view) => setClears(view.clears))
      .catch(() => undefined);
  }, [isAuthed]);

  const setNoticeMsg = (type: 'info' | 'ok' | 'err', text: string) => {
    setNoticeType(type);
    setNotice(text);
  };

  const updateFormula = useCallback(
    (r: number, c: number, board: number[][], notes: number[][][]) => {
      const scn = sceneAt(level, r, c);
      const room = level.rooms[scn.room];
      const val = board[r]?.[c] ?? 0;
      const given = givenMask[r]?.[c];
      const suspect = level.suspects.find((s) => s.num === val);
      let text = `${room?.name || scn.room} · ${scn.propLabel}`;
      if (scn.prop) text += ` ${scn.prop}`;
      if (given) text += ' · 题面给定';
      if (val) text += ` · 站位 ${val}`;
      if (suspect) text += `「${suspect.name}」`;
      const note = notes[r]?.[c] ?? [];
      if (note.length) text += ` · 笔记 [${[...note].sort((a, b) => a - b).join(',')}]`;
      onCellDetail?.(text);
      onSelectCell(cellRef(BOARD_ORIGIN.row + r, BOARD_ORIGIN.col + c));
    },
    [givenMask, level, onCellDetail, onSelectCell],
  );

  useEffect(() => {
    if (selected) {
      updateFormula(selected.r, selected.c, progress.board, progress.notes);
    }
  }, [selected, progress.board, progress.notes, updateFormula]);

  const switchLevel = (nextId: string) => {
    if (nextId === levelId) return;
    const ok = window.confirm('切换关卡将丢失当前关卡的进度，确定切换吗？');
    if (!ok) {
      // 受控 select 在取消后 DOM 可能仍停在新选项，强制 remount 回弹
      setLevelSelectKey((k) => k + 1);
      return;
    }
    clearCrimeSudokuProgress(level.id);
    setLevelId(nextId);
    const map = loadCrimeSudokuProgressMap();
    const notesMap = loadCrimeSudokuNotesMap();
    const lv = getCrimeSudokuLevel(nextId) ?? CRIME_SUDOKU_LEVELS[0]!;
    const saved = map[nextId];
    let next: CrimeSudokuLocalProgress;
    if (saved && saved.status === 'playing') {
      next = resumeTimer(saved);
    } else {
      next = createFreshProgress(lv);
      if (notesMap[nextId]) next.notes = notesMap[nextId]!;
    }
    setProgress(next);
    persist(next);
    setSelected({ r: 0, c: 0 });
    setNoteMode(false);
    setNoticeMsg('info', `已载入：${lv.name}`);
  };

  const restartLevel = () => {
    const ok = window.confirm('重新开始将清空本关当前进度，确定吗？');
    if (!ok) return;
    clearCrimeSudokuProgress(level.id);
    const notesMap = loadCrimeSudokuNotesMap();
    const next = createFreshProgress(level);
    // 重开清空盘面笔记，但保留独立笔记缓存可选：这里清空盘面笔记
    next.notes = emptyNotes(level.size);
    if (notesMap[level.id] && alreadyCleared) {
      // 再玩时从空笔记开始
    }
    setProgress(next);
    persist(next);
    setSelected({ r: 0, c: 0 });
    setNoteMode(false);
    setNoticeMsg('info', '已重新开局（免费）');
  };

  const placeNumber = (n: number) => {
    if (!selected || !isPlaying) return;
    const { r, c } = selected;
    if (givenMask[r]?.[c]) {
      setNoticeMsg('err', '题面数字不可改');
      return;
    }
    if (n !== 0 && (n < 1 || n > level.size)) return;

    setProgress((prev) => {
      const board = cloneBoard(prev.board);
      const notes = cloneNotes(prev.notes);
      if (noteMode && n !== 0) {
        const set = new Set(notes[r]![c]);
        if (set.has(n)) set.delete(n);
        else set.add(n);
        notes[r]![c] = [...set].sort((a, b) => a - b);
        board[r]![c] = 0;
      } else {
        board[r]![c] = n;
        notes[r]![c] = [];
      }
      const next = { ...prev, board, notes };
      persist(next);
      return next;
    });
  };

  const handleCheck = async () => {
    const result = checkWin(level, progress.board, progress.accused);
    if (!result.ok) {
      setNoticeMsg('err', result.reason);
      return;
    }
    const killer = level.suspects.find((s) => s.num === level.killer);
    const clearTimeMs = computeElapsedMs(progress);
    const next: CrimeSudokuLocalProgress = {
      ...freezeTimer(progress),
      elapsedMs: clearTimeMs,
      status: 'cleared',
      timerStartedAt: null,
    };
    setProgress(next);
    persist(next);

    if (!isAuthed) {
      setNoticeMsg('ok', `破案成功！真凶是「${killer?.name}」。登录后可领取奖励。`);
      return;
    }

    if (alreadyCleared || next.rewardClaimedLocally) {
      setNoticeMsg('ok', `破案成功！真凶是「${killer?.name}」（再玩不发奖励、不更新时长）`);
      return;
    }

    setBusy(true);
    try {
      const claimed = await CrimeSudokuApi.claimClear({ levelId: level.id, clearTimeMs });
      onWalletUpdate?.(claimed.wallet);
      setClears((prev) => {
        if (prev.some((item) => item.levelId === level.id)) return prev;
        return [
          ...prev,
          { levelId: level.id, clearTimeMs: claimed.clearTimeMs, claimedAt: Date.now() },
        ];
      });
      const marked = { ...next, rewardClaimedLocally: true };
      setProgress(marked);
      persist(marked);
      if (claimed.alreadyClaimed) {
        setNoticeMsg('ok', `破案成功！真凶是「${killer?.name}」（奖励此前已领取）`);
      } else {
        setNoticeMsg('ok', `破案成功！真凶是「${killer?.name}」· 奖励 +${claimed.rewardCoins} 金币`);
        onToast?.(`凶案数独通关：金币 +${claimed.rewardCoins}`);
      }
    } catch (err) {
      setNoticeMsg(
        'err',
        err instanceof HttpError ? err.message : '通关成功，但奖励领取失败，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  };

  const requestHint = () => {
    if (!selected) {
      setNoticeMsg('info', '先选中一个空格');
      return;
    }
    if (!isPlaying) {
      setNoticeMsg('info', '本局已通关，请重新开始后再用提示');
      return;
    }
    const { r, c } = selected;
    if (givenMask[r]?.[c] || progress.board[r]?.[c]) {
      setNoticeMsg('info', '该格已有数字');
      return;
    }
    if (progress.hintsUsed >= level.maxHints) {
      setNoticeMsg('err', `本局提示已用完（最多 ${level.maxHints} 次）`);
      return;
    }
    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if ((coins ?? 0) < level.hintCost) {
      setNoticeMsg('err', '金币不足，无法使用提示');
      return;
    }
    setShowHintConfirm(true);
  };

  const confirmHint = async () => {
    if (!selected || busy) return;
    const { r, c } = selected;
    setShowHintConfirm(false);
    setBusy(true);
    try {
      const result = await CrimeSudokuApi.useHint({
        levelId: level.id,
        hintsUsedBefore: progress.hintsUsed,
      });
      onWalletUpdate?.(result.wallet);
      const ans = level.solution[r]![c]!;
      const scn = sceneAt(level, r, c);
      setProgress((prev) => {
        const board = cloneBoard(prev.board);
        const notes = cloneNotes(prev.notes);
        board[r]![c] = ans;
        notes[r]![c] = [];
        const next = { ...prev, board, notes, hintsUsed: result.hintsUsed };
        persist(next);
        return next;
      });
      setNoticeMsg('info', `提示：${scn.propLabel} ← ${ans}（-${result.hintCost} 金币）`);
    } catch (err) {
      setNoticeMsg('err', err instanceof HttpError ? err.message : '提示失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleDisplayMode = (mode: CrimeSudokuDisplayMode) => {
    setDisplayMode(mode);
    saveCrimeSudokuDisplayMode(mode);
  };

  const toggleClueUsed = (index: number) => {
    setProgress((prev) => {
      const used = new Set(prev.usedClues);
      if (used.has(index)) used.delete(index);
      else used.add(index);
      const next = { ...prev, usedClues: [...used] };
      persist(next);
      return next;
    });
  };

  const selectSuspect = (num: number) => {
    if (!isPlaying) return;
    setProgress((prev) => {
      // 只能指认一人：再点同一人取消，点别人则改指认
      const accused = prev.accused === num ? null : num;
      const next = { ...prev, accused };
      persist(next);
      const s = level.suspects.find((item) => item.num === num);
      if (accused == null) {
        setNoticeMsg('info', '');
      } else {
        setNoticeMsg('info', `已指认真凶：${s?.name ?? num}（只能选一人）`);
      }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || !isPlaying) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key >= '1' && e.key <= String(Math.min(level.size, 9))) {
        placeNumber(Number(e.key));
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        placeNumber(0);
        e.preventDefault();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        let { r, c } = selected;
        if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (e.key === 'ArrowDown') r = Math.min(level.size - 1, r + 1);
        if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
        if (e.key === 'ArrowRight') c = Math.min(level.size - 1, c + 1);
        setSelected({ r, c });
        e.preventDefault();
      } else if (e.key === 'n' || e.key === 'N') {
        setNoteMode((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // placeNumber closes over selected/noteMode; rebind when they change
  });

  const { n: filled, total } = filledCount(progress.board);
  const liveElapsed = isPlaying && progress.timerStartedAt != null
    ? progress.elapsedMs + Math.max(0, now - progress.timerStartedAt)
    : elapsedMs;

  const renderBoardCell = (br: number, bc: number) => {
    const scn = sceneAt(level, br, bc);
    const room = level.rooms[scn.room];
    const val = progress.board[br]?.[bc] ?? 0;
    const given = givenMask[br]?.[bc];
    const key = `${br},${bc}`;
    const walls = roomWalls(level, br, bc);
    const isSelected = selected?.r === br && selected?.c === bc;
    const sameRowCol = selected && (selected.r === br || selected.c === bc) && !isSelected;
    const selVal = selected ? progress.board[selected.r]?.[selected.c] : 0;
    const sameNum = !!(selVal && val === selVal && !isSelected);
    const notes = progress.notes[br]?.[bc] ?? [];
    const isText = displayMode === 'text';

    const classNames = [
      styles.cell,
      styles.csPlayCell,
      given ? styles.csGiven : val ? styles.csUser : '',
      errors.has(key) ? styles.csError : '',
      walls.l ? styles.csWallL : '',
      walls.r ? styles.csWallR : '',
      walls.t ? styles.csWallT : '',
      walls.b ? styles.csWallB : '',
      isSelected ? styles.csSelected : '',
      sameRowCol ? styles.csHlSoft : '',
      sameNum ? styles.csSameNum : '',
      isText ? styles.csTextMode : styles.csIconMode,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        key={`play-${br}-${bc}`}
        type="button"
        className={classNames}
        style={isText ? undefined : { background: room?.color || '#fff' }}
        onClick={() => {
          setSelected({ r: br, c: bc });
          onSelectCell(cellRef(BOARD_ORIGIN.row + br, BOARD_ORIGIN.col + bc));
        }}
        title={`${room?.name || ''} · ${scn.propLabel}${val ? ` · 站位 ${val}` : ''}`}
      >
        {isText ? (
          <>
            <div className={styles.csTextLabel}>
              {room?.name || ''}·{scn.propLabel || '空地'}
            </div>
            <div className={styles.csNumRow}>
              {val ? (
                <span className={styles.csNum}>{val}</span>
              ) : notes.length ? (
                <div className={styles.csNotes}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const num = i + 1;
                    const on = num <= level.size && notes.includes(num);
                    return (
                      <span key={num} className={on ? styles.csNoteOn : undefined}>
                        {on ? num : ''}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className={styles.csTextPlaceholder}> </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.csSceneTop}>
              <span className={styles.csRoomTag}>{room?.name || scn.room}</span>
            </div>
            <div className={`${styles.csPropIcon}${scn.prop ? '' : ` ${styles.csPropEmpty}`}`}>
              {scn.prop || '·'}
            </div>
            <div className={styles.csNumRow}>
              {val ? (
                <span className={styles.csNum}>{val}</span>
              ) : notes.length ? (
                <div className={styles.csNotes}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const num = i + 1;
                    const on = num <= level.size && notes.includes(num);
                    return (
                      <span key={num} className={on ? styles.csNoteOn : undefined}>
                        {on ? num : ''}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        )}
      </button>
    );
  };

  return (
    <div className={`${styles.boardLayout} ${styles.csLayout}`}>
      <div className={styles.gridPane}>
        <div className={styles.llkToolbar}>
          <label>
            关卡
            <select
              key={levelSelectKey}
              value={levelId}
              onChange={(e) => switchLevel(e.target.value)}
              disabled={busy}
            >
              {CRIME_SUDOKU_LEVELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {clears.some((c) => c.levelId === item.id) ? ' ✅' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.llkStartBtn} onClick={restartLevel} disabled={busy}>
            {isPlaying ? '重新开始' : '再玩一局'}
          </button>
          <button type="button" className={styles.csToolBtn} onClick={() => void handleCheck()} disabled={busy}>
            验算通关
          </button>
          <button
            type="button"
            className={`${styles.csToolBtn}${noteMode ? ` ${styles.csToolActive}` : ''}`}
            onClick={() => setNoteMode((v) => !v)}
          >
            {noteMode ? '笔记中…' : '笔记模式'}
          </button>
          <button
            type="button"
            className={styles.csToolBtn}
            onClick={requestHint}
            disabled={busy || !isPlaying}
            title={`每次 ${level.hintCost} 金币，最多 ${level.maxHints} 次`}
          >
            提示（{progress.hintsUsed}/{level.maxHints}）
          </button>
          <div className={styles.llkSegmented} aria-label="展示模式">
            <button
              type="button"
              className={displayMode === 'text' ? styles.llkSegmentActive : ''}
              onClick={() => toggleDisplayMode('text')}
            >
              文字
            </button>
            <button
              type="button"
              className={displayMode === 'icon' ? styles.llkSegmentActive : ''}
              onClick={() => toggleDisplayMode('icon')}
            >
              图标
            </button>
          </div>
          <button type="button" className={styles.csToolBtn} onClick={() => setShowRules(true)}>
            玩法说明
          </button>
          <span className={styles.llkMeta}>
            计时 {formatCrimeSudokuTime(liveElapsed)}
            {progress.status === 'cleared' ? ' · 已通关' : ''}
          </span>
          <span className={styles.llkMeta}>
            奖励 {alreadyCleared ? '已领' : `${level.rewardCoins}金币`}
          </span>
          {clearRecord ? (
            <span className={styles.llkMeta}>
              最佳 {formatCrimeSudokuTime(clearRecord.clearTimeMs)}
            </span>
          ) : null}
          <span
            className={
              noticeType === 'ok'
                ? styles.llkSettling
                : noticeType === 'err'
                  ? styles.llkNotice
                  : styles.llkMeta
            }
          >
            {notice}
          </span>
        </div>

        <div className={styles.csLegend}>
          {Object.entries(level.rooms).map(([id, room]) => (
            <span key={id} className={styles.csLegendItem}>
              <span
                className={styles.csLegendSwatch}
                style={{ background: displayMode === 'icon' ? room.color : '#f0f0f0' }}
              />
              {room.name}
            </span>
          ))}
          <span className={styles.csLegendItem}>
            {displayMode === 'text' ? '文字模式：极浅灰底 + 位置/物品标注' : '细线 = 房间墙 · 图标 = 家具'}
          </span>
        </div>

        <div className={styles.wrap} ref={wrapRef}>
          <div className={styles.corner} />
          <div className={styles.colHeaders}>
            {cols.map((col, index) => (
              <div
                key={col}
                className={`${styles.colHeader} ${styles.csColHeader}${index >= dataCols ? ` ${styles.csFillerCol}` : ''}`}
              >
                {col}
              </div>
            ))}
          </div>
          <div className={styles.body}>
            {Array.from({ length: totalRows }, (_, rowIndex) => {
              const isFillerRow = rowIndex >= dataRows;
              const isTitleRow = rowIndex < TITLE_ROWS;
              const rowClass = isTitleRow ? styles.csTitleRow : styles.csRow;
              const emptyClass = isTitleRow ? styles.csTitleEmpty : styles.csEmptyCell;
              const fillerClass = isTitleRow ? styles.csTitleFiller : styles.csFillerCell;
              return (
                <div
                  key={rowIndex}
                  className={`${styles.row} ${rowClass}${isFillerRow && rowIndex === totalRows - 1 ? ` ${styles.fillerRowStretch}` : ''}`}
                >
                  <div className={`${styles.rowHeader} ${isTitleRow ? styles.csTitleRowHeader : styles.csRowHeader}`}>
                    {rowIndex + 1}
                  </div>
                  {cols.map((col, colIndex) => {
                    const ref = `${col}${rowIndex + 1}`;
                    const isFillerCol = colIndex >= dataCols;
                    if (isFillerRow || isFillerCol) {
                      return (
                        <div
                          key={ref}
                          className={`${styles.fillerCell} ${fillerClass}`}
                        />
                      );
                    }

                    // 标题/说明行：合并盘面宽度，其余列用矮空格，避免撑高
                    const titleSpan = level.size;
                    const suspectCol = BOARD_ORIGIN.col + level.size + 1;
                    if (isTitleRow) {
                      if (colIndex > BOARD_ORIGIN.col && colIndex < BOARD_ORIGIN.col + titleSpan) {
                        return null;
                      }
                      if (rowIndex === 0 && colIndex === BOARD_ORIGIN.col) {
                        return (
                          <div
                            key={ref}
                            className={`${styles.cell} ${styles.csTitleCell} ${ref === selectedCell ? styles.selected : ''}`}
                            style={{ width: CELL_SIZE * titleSpan, minWidth: CELL_SIZE * titleSpan }}
                            onClick={() => onSelectCell(ref)}
                          >
                            【{level.title}】平面图 · {level.difficulty}
                          </div>
                        );
                      }
                      if (rowIndex === 1 && colIndex === BOARD_ORIGIN.col) {
                        return (
                          <div
                            key={ref}
                            className={`${styles.cell} ${styles.csHintCell} ${ref === selectedCell ? styles.selected : ''}`}
                            style={{ width: CELL_SIZE * titleSpan, minWidth: CELL_SIZE * titleSpan }}
                            onClick={() => onSelectCell(ref)}
                          >
                            {level.ruleHint}
                          </div>
                        );
                      }
                      if (rowIndex === 1 && colIndex === suspectCol) {
                        return (
                          <div key={ref} className={`${styles.cell} ${styles.csSuspectHeader}`}>
                            指认嫌疑人
                          </div>
                        );
                      }
                      return (
                        <div
                          key={ref}
                          className={`${styles.cell} ${emptyClass} ${ref === selectedCell ? styles.selected : ''}`}
                          onClick={() => {
                            onSelectCell(ref);
                            onCellDetail?.('（空）');
                          }}
                        />
                      );
                    }

                    const inBoard =
                      rowIndex >= BOARD_ORIGIN.row &&
                      rowIndex < BOARD_ORIGIN.row + level.size &&
                      colIndex >= BOARD_ORIGIN.col &&
                      colIndex < BOARD_ORIGIN.col + level.size;

                    if (inBoard) {
                      return renderBoardCell(rowIndex - BOARD_ORIGIN.row, colIndex - BOARD_ORIGIN.col);
                    }

                    const boardRowOffset = rowIndex - BOARD_ORIGIN.row;

                    if (
                      colIndex === suspectCol &&
                      boardRowOffset >= 0 &&
                      boardRowOffset < level.suspects.length
                    ) {
                      const s = level.suspects[boardRowOffset];
                      if (s) {
                        return (
                          <button
                            key={ref}
                            type="button"
                            className={`${styles.cell} ${styles.csSuspectCell}${progress.accused === s.num ? ` ${styles.csSuspectHot}` : ''}`}
                            onClick={() => {
                              onSelectCell(ref);
                              selectSuspect(s.num);
                            }}
                          >
                            <span className={styles.csBadge}>{s.num}</span>
                            {s.name}
                          </button>
                        );
                      }
                    }

                    return (
                      <div
                        key={ref}
                        className={`${styles.cell} ${emptyClass} ${ref === selectedCell ? styles.selected : ''}`}
                        onClick={() => {
                          onSelectCell(ref);
                          onCellDetail?.('（空）');
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className={styles.sidePane}>
        <section className={styles.csPanel}>
          <div className={styles.csPanelTitle}>
            案情线索 <span>{level.clues.length} 条</span>
          </div>
          <div className={styles.csPanelBody}>
            <div className={styles.csCaseCard}>
              <h3>{level.title}</h3>
              <p>{level.story}</p>
              <div className={styles.csCaseMeta}>
                受害者：{level.victim.name} · {level.rooms[level.victim.room]?.name ?? level.victim.room}
                <br />
                {level.victim.clue}
              </div>
              <div className={styles.csCaseMeta}>{level.ruleHint}</div>
            </div>
            <ul className={styles.csClueList}>
              {level.clues.map((text, i) => (
                <li key={i} className={progress.usedClues.includes(i) ? styles.csClueUsed : undefined}>
                  <span className={styles.csClueN}>{i + 1}</span>
                  <span>{text}</span>
                  <button type="button" onClick={() => toggleClueUsed(i)}>
                    {progress.usedClues.includes(i) ? '标为未用' : '标为已用'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.csPanel}>
          <div className={styles.csPanelTitle}>
            嫌疑人 · 口供 <span>点选唯一真凶</span>
          </div>
          <div className={styles.csPanelBody}>
            <div className={styles.csSuspectGrid}>
              {level.suspects.map((s) => (
                <button
                  key={s.num}
                  type="button"
                  className={`${styles.csSuspect}${progress.accused === s.num ? ` ${styles.csSuspectPicked}` : ''}`}
                  onClick={() => selectSuspect(s.num)}
                  disabled={!isPlaying}
                >
                  <div className={styles.csSuspectName}>
                    <span className={styles.csBadge}>{s.num}</span>
                    {s.name}
                  </div>
                  <div className={styles.csSuspectRole}>{s.role}</div>
                  <div className={styles.csSuspectClue}>{s.clue}</div>
                  <div className={styles.csSuspectStatus}>
                    {progress.accused === s.num ? '✓ 已指认为真凶' : '点击指认为真凶'}
                  </div>
                </button>
              ))}
            </div>
            <div className={styles.csNumpad}>
              {Array.from({ length: Math.min(level.size, 9) }, (_, i) => (
                <button key={i + 1} type="button" onClick={() => placeNumber(i + 1)} disabled={!isPlaying}>
                  {i + 1}
                </button>
              ))}
              <button type="button" className={styles.csNumpadWide} onClick={() => placeNumber(0)} disabled={!isPlaying}>
                清除
              </button>
              <button type="button" className={styles.csNumpadWide} onClick={() => void handleCheck()} disabled={busy}>
                验算通关
              </button>
            </div>
            <div className={styles.csProgressMeta}>
              进度 {filled}/{total}
              {errors.size ? ` · 冲突 ${errors.size}` : ''}
              {noteMode ? ' · 笔记模式' : ' · 填数模式'}
            </div>
          </div>
        </section>
      </aside>

      {showRules ? (
        <div className={styles.csModalMask} onClick={() => setShowRules(false)}>
          <div className={styles.csModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.csModalHeader}>
              <h3 className={styles.csModalTitle}>说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: CRIME_SUDOKU_RULES_HTML }} />
          </div>
        </div>
      ) : null}

      {showHintConfirm ? (
        <div className={styles.csModalMask} onClick={() => setShowHintConfirm(false)}>
          <div className={styles.csConfirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.csModalHeader}>
              <h3 className={styles.csModalTitle}>使用提示</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowHintConfirm(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csConfirmBody}>
              <p>将消耗 <strong>{level.hintCost} 金币</strong>，为当前选中空格填入正确答案。</p>
              <p className={styles.csConfirmMeta}>
                本局已用提示 {progress.hintsUsed}/{level.maxHints} 次
              </p>
              <div className={styles.csConfirmActions}>
                <button type="button" className={styles.csToolBtn} onClick={() => setShowHintConfirm(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className={styles.llkStartBtn}
                  onClick={() => void confirmHint()}
                  disabled={busy}
                >
                  确认使用
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
