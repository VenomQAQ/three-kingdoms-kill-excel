import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SumTo10Config, SumTo10Cell, SumTo10Session } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import {
  buildDemoBoard,
  formatSumTo10Time,
  getRectCells,
  isCellInRect,
  SUM_TO_10_RULES_HTML,
  sumCells,
} from '../../utils/sumTo10';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface SumTo10GridProps {
  config: SumTo10Config | null;
  session: SumTo10Session | null;
  loading: boolean;
  settling: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (difficultyId: string) => Promise<SumTo10Session | null>;
  onFinish: (result: 'won' | 'lost', score: number) => Promise<void>;
  onRequireLogin: () => void;
}

interface DragPoint {
  row: number;
  col: number;
}

const ELIMINATE_FLASH_MS = 280;

export function SumTo10Grid({
  config,
  session,
  loading,
  settling,
  selectedCell,
  isAuthed,
  onSelectCell,
  onStart,
  onFinish,
  onRequireLogin,
}: SumTo10GridProps) {
  const [difficultyId, setDifficultyId] = useState('');
  const [cells, setCells] = useState<SumTo10Cell[]>([]);
  const [score, setScore] = useState(0);
  const [notice, setNotice] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [winAt, setWinAt] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [dragEnd, setDragEnd] = useState<DragPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(() => new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timeoutHandledRef = useRef(false);
  const startGuardRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);

  const isActiveGame = session?.status === 'playing';
  const setupLocked = loading || settling || isActiveGame;

  useEffect(() => {
    if (!config) return;
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    setCells(session.board.map((cell) => ({ ...cell })));
    setScore(0);
    setNotice('');
    setWinAt(null);
    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
    setFlashingIds(new Set());
    timeoutHandledRef.current = false;
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  }, [session?.sessionId, session?.status, session?.board]);

  useEffect(() => {
    if (session?.status === 'won' && session.finishedAt && winAt == null) {
      setWinAt(session.finishedAt);
    }
  }, [session?.status, session?.finishedAt, winAt]);

  useEffect(() => {
    if (!isActiveGame || winAt != null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [isActiveGame, winAt]);

  useEffect(() => () => {
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'playing' || winAt != null) return;
    if (now <= session.deadlineAt) return;
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    const passed = score >= session.targetScore;
    setWinAt(Date.now());
    if (passed) {
      setNotice('时间到，挑战成功');
      void onFinish('won', score);
    } else {
      setNotice('时间到，挑战失败');
      void onFinish('lost', score);
    }
  }, [now, onFinish, score, session, winAt]);

  const previewDifficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId);
  const activeDifficultyId = isActiveGame ? (session?.difficultyId ?? difficultyId) : difficultyId;
  const difficulty = config?.difficulties.find((item) => item.difficultyId === activeDifficultyId);

  const demoCells = useMemo(() => {
    if (!previewDifficulty) return [];
    return buildDemoBoard(previewDifficulty.rows, previewDifficulty.cols);
  }, [previewDifficulty]);

  const displayCells = isActiveGame ? cells : demoCells;
  const cellMap = useMemo(
    () => new Map(displayCells.map((cell) => [`${cell.row},${cell.col}`, cell])),
    [displayCells],
  );

  const dataColCount = isActiveGame
    ? (session?.cols ?? previewDifficulty?.cols ?? 8)
    : (previewDifficulty?.cols ?? 8);
  const rows = isActiveGame
    ? (session?.rows ?? previewDifficulty?.rows ?? 6)
    : (previewDifficulty?.rows ?? 6);
  const filler = useCellFiller(wrapRef, rows, dataColCount, 56, 36);
  const cols = useMemo(
    () => Array.from({ length: dataColCount + filler.cols }, (_, index) => COL_LABELS[index] ?? `C${index + 1}`),
    [dataColCount, filler.cols],
  );

  const clockAt = winAt ?? now;
  const remainingMs = session ? Math.max(0, session.deadlineAt - clockAt) : 0;
  const elapsedMs = session && winAt != null ? winAt - session.startedAt : 0;
  const showElapsed = winAt != null;
  const targetScore = session?.targetScore ?? previewDifficulty?.targetScore ?? 0;

  const selectionSum = useMemo(() => {
    if (!dragStart || !dragEnd || !isActiveGame) return null;
    const selected = getRectCells(cells, dragStart.row, dragStart.col, dragEnd.row, dragEnd.col);
    return sumCells(selected);
  }, [cells, dragEnd, dragStart, isActiveGame]);

  const handleStart = async () => {
    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if (setupLocked || startGuardRef.current) return;
    startGuardRef.current = true;
    try {
      const next = await onStart(difficultyId);
      if (next) setNotice('');
    } finally {
      window.setTimeout(() => {
        startGuardRef.current = false;
      }, 1000);
    }
  };

  const tryEliminate = useCallback((start: DragPoint, end: DragPoint) => {
    if (!session || session.status !== 'playing' || settling) return;
    const selected = getRectCells(cells, start.row, start.col, end.row, end.col);
    if (selected.length === 0) return;
    const total = sumCells(selected);
    if (total !== 10) {
      // 仅多选且和不等于 10 时提示；单击单个数字不提示
      if (selected.length > 1) {
        setNotice(`选区和为 ${total}，需正好等于 10`);
      }
      return;
    }

    const ids = new Set(selected.map((cell) => cell.cellId));
    setFlashingIds(ids);
    setNotice(`消除 ${selected.length} 个数字，+${selected.length} 分`);

    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setCells((prev) =>
        prev.map((cell) =>
          ids.has(cell.cellId) ? { ...cell, value: 0 } : cell,
        ),
      );
      setScore((prev) => {
        const nextScore = prev + selected.length;
        if (nextScore >= session.targetScore && prev < session.targetScore) {
          setNotice(`已达目标分 ${session.targetScore}，可继续玩到时间结束`);
        }
        return nextScore;
      });
      setFlashingIds(new Set());
      flashTimerRef.current = null;
    }, ELIMINATE_FLASH_MS);
  }, [cells, session, settling]);

  const endDrag = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    tryEliminate(dragStart, dragEnd);
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [dragEnd, dragStart, isDragging, tryEliminate]);

  useEffect(() => {
    if (!isDragging) return undefined;
    const onMouseUp = () => endDrag();
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [endDrag, isDragging]);

  const handleCellMouseDown = (row: number, col: number, ref: string) => {
    onSelectCell(ref);
    if (!isActiveGame || settling || winAt != null) return;
    setIsDragging(true);
    setDragStart({ row, col });
    setDragEnd({ row, col });
    setNotice('');
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isDragging || !dragStart) return;
    setDragEnd({ row, col });
  };

  const isCellSelected = (row: number, col: number) => {
    if (!dragStart || !dragEnd) return false;
    return isCellInRect(row, col, dragStart.row, dragStart.col, dragEnd.row, dragEnd.col);
  };

  return (
    <div className={styles.gridPane}>
      <div className={styles.llkToolbar}>
        <label>
          难度
          <select value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)} disabled={setupLocked}>
            {(config?.difficulties ?? []).map((item) => (
              <option key={item.difficultyId} value={item.difficultyId}>
                {item.name} · 目标 {item.targetScore} 分
              </option>
            ))}
          </select>
        </label>
        {difficulty ? (
          <span className={styles.llkMeta}>
            入场 {config?.entryFee ?? 5} 金币 · 通关 +{difficulty.rewardCoins} 金币
          </span>
        ) : null}
        <button type="button" className={styles.llkStartBtn} onClick={handleStart} disabled={setupLocked || !config}>
          {loading ? '开局中' : settling ? '结算中' : '开始'}
        </button>
        <button type="button" className={styles.csToolBtn} onClick={() => setShowRules(true)}>
          玩法说明
        </button>
        {session ? (
          <span className={styles.llkMeta}>
            剩余 {formatSumTo10Time(remainingMs)}
            {showElapsed ? ` · 消耗 ${formatSumTo10Time(elapsedMs)}` : ''}
            {isActiveGame ? ` · 积分 ${score}/${targetScore}` : ''}
            {isDragging && selectionSum != null ? ` · 选区和 ${selectionSum}` : ''}
          </span>
        ) : null}
        {settling ? (
          <span className={styles.llkSettling}>结算中…</span>
        ) : notice ? (
          <span className={styles.llkNotice}>{notice}</span>
        ) : null}
      </div>
      <div className={`${styles.wrap} ${styles.stWrap}`} ref={wrapRef}>
        <div className={styles.corner} />
        <div className={styles.colHeaders}>
          {cols.map((col, index) => (
            <div
              key={col}
              className={`${styles.colHeader} ${styles.stColHeader}${index >= dataColCount ? ` ${styles.stFillerColHeader}` : ''}`}
            >
              {col}
            </div>
          ))}
        </div>
        <div className={styles.body}>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <div key={rowIndex} className={`${styles.row} ${styles.stRow}`}>
              <div className={`${styles.rowHeader} ${styles.stRowHeader}`}>{rowIndex + 1}</div>
              {cols.map((col, colIndex) => {
                const ref = `${col}${rowIndex + 1}`;
                const cell = cellMap.get(`${rowIndex},${colIndex}`);
                const isFillerCol = colIndex >= dataColCount;
                const hasValue = Boolean(cell && cell.value > 0);
                const selected = cell ? isCellSelected(cell.row, cell.col) : false;
                const flashing = cell ? flashingIds.has(cell.cellId) : false;
                const isPlayable = isActiveGame && cell && !isFillerCol && winAt == null;
                return (
                  <div
                    key={ref}
                    role="gridcell"
                    className={[
                      styles.cell,
                      styles.stCell,
                      isFillerCol ? styles.stFillerCell : '',
                      !isActiveGame && cell ? styles.llkDemoCell : '',
                      !hasValue && cell && !isFillerCol ? styles.stEmpty : '',
                      ref === selectedCell ? styles.selected : '',
                      selected ? styles.stSelected : '',
                      flashing ? styles.stEliminating : '',
                    ].filter(Boolean).join(' ')}
                    onMouseDown={(event) => {
                      if (!isPlayable) return;
                      event.preventDefault();
                      handleCellMouseDown(rowIndex, colIndex, ref);
                    }}
                    onMouseEnter={() => {
                      if (isPlayable) handleCellMouseEnter(rowIndex, colIndex);
                    }}
                  >
                    {hasValue && !isFillerCol ? (
                      <span className={styles.stNumber}>{cell!.value}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {Array.from({ length: filler.rows }, (_, index) => {
            const rowNum = rows + index + 1;
            const isLastRow = index === filler.rows - 1;
            return (
              <div
                key={`filler-${rowNum}`}
                className={`${styles.row} ${styles.fillerRow}${isLastRow ? ` ${styles.fillerRowStretch}` : ''}`}
              >
                <div className={`${styles.rowHeader} ${styles.stRowHeader}`}>{rowNum}</div>
                {cols.map((col) => (
                  <div key={`${col}${rowNum}`} className={`${styles.fillerCell} ${styles.stFillerCell}`} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {showRules ? (
        <div className={styles.csModalMask} onClick={() => setShowRules(false)}>
          <div className={styles.csModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.csModalHeader}>
              <h3 className={styles.csModalTitle}>合10 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: SUM_TO_10_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
