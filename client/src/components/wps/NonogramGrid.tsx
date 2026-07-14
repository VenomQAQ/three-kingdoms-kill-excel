import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NonogramCellState, NonogramConfig, NonogramSession } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import {
  boardToBool,
  buildDemoClues,
  buildDemoDigits,
  computeCompletedLines,
  createEmptyBoard,
  formatClues,
  isBoardSolved,
  NONOGRAM_RULES_HTML,
} from '../../utils/nonogram';
import {
  clearNonogramProgress,
  loadNonogramProgress,
  saveNonogramProgress,
} from '../../utils/nonogramStorage';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface NonogramGridProps {
  config: NonogramConfig | null;
  session: NonogramSession | null;
  loading: boolean;
  settling: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (difficultyId: string) => Promise<NonogramSession | null>;
  onFinish: (result: 'won' | 'lost', board: boolean[][], mistakes: number) => Promise<void>;
  onRequireLogin: () => void;
}

const CELL_W = 56;
const CELL_H = 36;
const WRONG_FLASH_MS = 420;
/** 第 1 列为行线索，第 1 行为列线索 */
const CLUE_OFFSET = 1;

export function NonogramGrid({
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
}: NonogramGridProps) {
  const [difficultyId, setDifficultyId] = useState('');
  const [board, setBoard] = useState<NonogramCellState[][]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [notice, setNotice] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [wrongCell, setWrongCell] = useState<{ row: number; col: number } | null>(null);
  const [ended, setEnded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const startGuardRef = useRef(false);
  const wrongTimerRef = useRef<number | null>(null);
  const finishGuardRef = useRef(false);

  const isActiveGame = session?.status === 'playing' && !ended;
  const setupLocked = loading || settling || (session?.status === 'playing' && !ended);

  useEffect(() => {
    if (!config) return;
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') {
      if (session?.status === 'won' || session?.status === 'lost') {
        setEnded(true);
      }
      return;
    }

    finishGuardRef.current = false;
    setEnded(false);
    setNotice('');
    setWrongCell(null);

    const cached = loadNonogramProgress(session.sessionId);
    if (cached && cached.size === session.size) {
      setBoard(cached.board.map((row) => [...row]));
      setMistakes(cached.mistakes);
      setDifficultyId(session.difficultyId);
      return;
    }

    setBoard(createEmptyBoard(session.size));
    setMistakes(0);
    setDifficultyId(session.difficultyId);
    saveNonogramProgress({
      sessionId: session.sessionId,
      difficultyId: session.difficultyId,
      size: session.size,
      board: createEmptyBoard(session.size),
      mistakes: 0,
      updatedAt: Date.now(),
      _v: 1,
    });
  }, [session?.sessionId, session?.status, session?.size, session?.difficultyId]);

  useEffect(() => () => {
    if (wrongTimerRef.current != null) window.clearTimeout(wrongTimerRef.current);
  }, []);

  const persistProgress = useCallback(
    (nextBoard: NonogramCellState[][], nextMistakes: number) => {
      if (!session || session.status !== 'playing') return;
      saveNonogramProgress({
        sessionId: session.sessionId,
        difficultyId: session.difficultyId,
        size: session.size,
        board: nextBoard,
        mistakes: nextMistakes,
        updatedAt: Date.now(),
        _v: 1,
      });
    },
    [session],
  );

  const previewDifficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId);
  const activeDifficultyId = session?.status === 'playing' ? session.difficultyId : difficultyId;
  const difficulty = config?.difficulties.find((item) => item.difficultyId === activeDifficultyId);
  const size = session?.status === 'playing'
    ? session.size
    : (previewDifficulty?.size ?? 5);

  const demoClues = useMemo(() => buildDemoClues(size), [size]);
  const rowClues = session?.status === 'playing' ? session.rowClues : demoClues.rowClues;
  const colClues = session?.status === 'playing' ? session.colClues : demoClues.colClues;
  const digits = session?.status === 'playing' ? session.digits : buildDemoDigits(size);
  const solution = session?.status === 'playing' ? session.solution : null;
  const displayBoard = session?.status === 'playing' ? board : createEmptyBoard(size);

  const completed = useMemo(() => {
    if (!solution || displayBoard.length !== size) {
      return {
        rows: Array.from({ length: size }, () => false),
        cols: Array.from({ length: size }, () => false),
      };
    }
    return computeCompletedLines(displayBoard, solution);
  }, [displayBoard, solution, size]);

  const maxMistakes = session?.maxMistakes ?? config?.maxMistakes ?? 3;
  /** 含线索行/列的表格尺寸 */
  const sheetRows = size + CLUE_OFFSET;
  const sheetCols = size + CLUE_OFFSET;
  const filler = useCellFiller(wrapRef, sheetRows, sheetCols, CELL_W, CELL_H);
  const cols = useMemo(
    () => Array.from({ length: sheetCols + filler.cols }, (_, index) => COL_LABELS[index] ?? `C${index + 1}`),
    [sheetCols, filler.cols],
  );

  const settle = useCallback(
    async (result: 'won' | 'lost', nextBoard: NonogramCellState[][], nextMistakes: number) => {
      if (!session || finishGuardRef.current) return;
      finishGuardRef.current = true;
      setEnded(true);
      clearNonogramProgress(session.sessionId);
      await onFinish(result, boardToBool(nextBoard), nextMistakes);
    },
    [onFinish, session],
  );

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

  /** sheet 坐标 → 玩法坐标；非玩法格返回 null */
  const toPlayCoord = (sheetRow: number, sheetCol: number) => {
    if (sheetRow < CLUE_OFFSET || sheetCol < CLUE_OFFSET) return null;
    return { row: sheetRow - CLUE_OFFSET, col: sheetCol - CLUE_OFFSET };
  };

  const handleCellClick = (sheetRow: number, sheetCol: number, ref: string) => {
    onSelectCell(ref);
    const play = toPlayCoord(sheetRow, sheetCol);
    if (!play || !isActiveGame || !session || !solution || settling) return;
    const { row, col } = play;
    if (completed.rows[row] || completed.cols[col]) {
      setNotice('该行/列已完成，不可再修改');
      return;
    }

    const current = board[row]?.[col];
    if (current === 'filled') {
      setNotice('已勾选，不可取消');
      return;
    }

    const shouldFill = Boolean(solution[row]?.[col]);
    if (shouldFill) {
      const nextBoard = board.map((r, ri) =>
        r.map((cell, ci) => (ri === row && ci === col ? 'filled' : cell)),
      );
      setBoard(nextBoard);
      persistProgress(nextBoard, mistakes);
      setNotice('正确');

      if (isBoardSolved(nextBoard, solution)) {
        setNotice('全部正确，通关！');
        void settle('won', nextBoard, mistakes);
      }
      return;
    }

    const nextMistakes = mistakes + 1;
    setMistakes(nextMistakes);
    setWrongCell({ row, col });
    if (wrongTimerRef.current != null) window.clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = window.setTimeout(() => {
      setWrongCell(null);
      wrongTimerRef.current = null;
    }, WRONG_FLASH_MS);

    persistProgress(board, nextMistakes);

    if (nextMistakes > maxMistakes) {
      setNotice(`失误超过 ${maxMistakes} 次，挑战失败`);
      void settle('lost', board, nextMistakes);
    } else {
      setNotice(`选错了！失误 ${nextMistakes}/${maxMistakes}`);
    }
  };

  return (
    <div className={styles.gridPane}>
      <div className={styles.llkToolbar}>
        <label>
          难度
          <select
            value={difficultyId}
            onChange={(event) => setDifficultyId(event.target.value)}
            disabled={setupLocked}
          >
            {(config?.difficulties ?? []).map((item) => (
              <option key={item.difficultyId} value={item.difficultyId}>
                {item.name} · {item.size}×{item.size} · +{item.rewardCoins}金币
              </option>
            ))}
          </select>
        </label>
        {difficulty ? (
          <span className={styles.llkMeta}>
            入场 {config?.entryFee ?? 5} 金币 · 通关 +{difficulty.rewardCoins} 金币 · 不限时长
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
            失误 {mistakes}/{maxMistakes}
            {session.status === 'won' ? ' · 已通关' : ''}
            {session.status === 'lost' || (ended && mistakes > maxMistakes) ? ' · 已失败' : ''}
          </span>
        ) : null}
        {settling ? (
          <span className={styles.llkSettling}>结算中…</span>
        ) : notice ? (
          <span className={styles.llkNotice}>{notice}</span>
        ) : null}
      </div>

      <div className={`${styles.wrap} ${styles.stWrap}`} ref={wrapRef}>
        <div className={`${styles.corner} ${styles.ngEdgeTop} ${styles.ngEdgeLeft}`} />
        <div className={styles.colHeaders}>
          {cols.map((col, index) => (
            <div
              key={col}
              className={[
                styles.colHeader,
                styles.stColHeader,
                index >= sheetCols ? styles.stFillerColHeader : '',
                index < sheetCols ? styles.ngEdgeTop : '',
                index === sheetCols - 1 ? styles.ngEdgeRight : '',
              ].filter(Boolean).join(' ')}
            >
              {col}
            </div>
          ))}
        </div>
        <div className={styles.body}>
          {Array.from({ length: sheetRows }, (_, sheetRow) => {
            const isLastGameRow = sheetRow === sheetRows - 1;
            return (
            <div key={sheetRow} className={`${styles.row} ${styles.stRow}`}>
              <div
                className={[
                  styles.rowHeader,
                  styles.stRowHeader,
                  styles.ngEdgeLeft,
                  isLastGameRow ? styles.ngEdgeBottom : '',
                ].filter(Boolean).join(' ')}
              >
                {sheetRow + 1}
              </div>
              {cols.map((col, sheetCol) => {
                const ref = `${col}${sheetRow + 1}`;
                const isFillerCol = sheetCol >= sheetCols;
                if (isFillerCol) {
                  return (
                    <div
                      key={ref}
                      className={`${styles.cell} ${styles.stCell} ${styles.stFillerCell}`}
                    />
                  );
                }

                const edgeClass = [
                  isLastGameRow ? styles.ngEdgeBottom : '',
                  sheetCol === sheetCols - 1 ? styles.ngEdgeRight : '',
                ].filter(Boolean).join(' ');

                // A1 角落
                if (sheetRow === 0 && sheetCol === 0) {
                  return (
                    <div
                      key={ref}
                      role="gridcell"
                      className={[
                        styles.cell,
                        styles.stCell,
                        styles.ngClueCell,
                        edgeClass,
                        ref === selectedCell ? styles.selected : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => onSelectCell(ref)}
                    />
                  );
                }

                // 第 1 行：列线索
                if (sheetRow === 0 && sheetCol >= CLUE_OFFSET) {
                  const playCol = sheetCol - CLUE_OFFSET;
                  const clueText = formatClues(colClues[playCol] ?? [0]);
                  const done = Boolean(completed.cols[playCol]);
                  return (
                    <div
                      key={ref}
                      role="gridcell"
                      className={[
                        styles.cell,
                        styles.stCell,
                        styles.ngClueCell,
                        done ? styles.ngClueDone : '',
                        edgeClass,
                        ref === selectedCell ? styles.selected : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => onSelectCell(ref)}
                      title={done ? `已完成 · ${clueText}` : clueText}
                    >
                      <span className={styles.ngClueText}>{clueText}</span>
                    </div>
                  );
                }

                // A 列：行线索
                if (sheetCol === 0 && sheetRow >= CLUE_OFFSET) {
                  const playRow = sheetRow - CLUE_OFFSET;
                  const clueText = formatClues(rowClues[playRow] ?? [0]);
                  const done = Boolean(completed.rows[playRow]);
                  return (
                    <div
                      key={ref}
                      role="gridcell"
                      className={[
                        styles.cell,
                        styles.stCell,
                        styles.ngClueCell,
                        done ? styles.ngClueDone : '',
                        edgeClass,
                        ref === selectedCell ? styles.selected : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => onSelectCell(ref)}
                      title={done ? `已完成 · ${clueText}` : clueText}
                    >
                      <span className={styles.ngClueText}>{clueText}</span>
                    </div>
                  );
                }

                // 可玩格：开局前展示诱饵数字；开局后空白，勾选后显示 1
                const playRow = sheetRow - CLUE_OFFSET;
                const playCol = sheetCol - CLUE_OFFSET;
                const digit = digits[playRow]?.[playCol] ?? 0;
                const filled = displayBoard[playRow]?.[playCol] === 'filled';
                const lineDone = Boolean(completed.rows[playRow] || completed.cols[playCol]);
                const locked = lineDone && isActiveGame;
                const isWrong =
                  wrongCell?.row === playRow && wrongCell?.col === playCol;
                const isPlayable = isActiveGame && !locked && !filled;
                const showDemoDigit = !isActiveGame && session?.status !== 'playing';
                const cellText = filled ? '1' : showDemoDigit ? String(digit) : '';

                return (
                  <div
                    key={ref}
                    role="gridcell"
                    className={[
                      styles.cell,
                      styles.stCell,
                      !session || session.status !== 'playing' ? styles.llkDemoCell : '',
                      filled ? styles.ngFilled : '',
                      lineDone ? styles.ngLineDone : '',
                      locked ? styles.ngLocked : '',
                      isWrong ? styles.ngWrong : '',
                      edgeClass,
                      ref === selectedCell ? styles.selected : '',
                      isPlayable ? styles.ngPlayable : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleCellClick(sheetRow, sheetCol, ref)}
                  >
                    {cellText ? (
                      <span className={filled ? styles.ngNumberFilled : styles.ngNumberIdle}>
                        {cellText}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            );
          })}
          {Array.from({ length: filler.rows }, (_, index) => {
            const rowNum = sheetRows + index + 1;
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
              <h3 className={styles.csModalTitle}>数织 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: NONOGRAM_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
