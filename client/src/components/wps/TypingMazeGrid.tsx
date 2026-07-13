import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TypingMazeConfig, TypingMazePos, TypingMazeSession } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import {
  buildTypingMazeDemo,
  cellRef,
  checkTypingAnswer,
  formatTypingMazeTime,
  getCell,
  getMazeNeighbors,
  getPureOrder,
  matchMazeNeighborByInput,
  TYPING_MAZE_RULES_HTML,
  wallDecoyNumber,
} from '../../utils/typingMaze';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface TypingMazeGridProps {
  config: TypingMazeConfig | null;
  session: TypingMazeSession | null;
  loading: boolean;
  settling: boolean;
  extending: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (modeId: string) => Promise<TypingMazeSession | null>;
  onExtend: () => Promise<TypingMazeSession | null>;
  onFinish: (result: 'won' | 'lost', clearedCount: number) => Promise<void>;
  onRequireLogin: () => void;
}

function posKey(p: TypingMazePos): string {
  return `${p.r},${p.c}`;
}

export function TypingMazeGrid({
  config,
  session,
  loading,
  settling,
  extending,
  selectedCell,
  isAuthed,
  coins,
  onSelectCell,
  onStart,
  onExtend,
  onFinish,
  onRequireLogin,
}: TypingMazeGridProps) {
  const [modeId, setModeId] = useState('maze');
  const [showRules, setShowRules] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState('');
  /** 纯打字：当前目标下标；迷宫：已成功前进次数 */
  const [clearedCount, setClearedCount] = useState(0);
  /** 迷宫当前位置 */
  const [cursor, setCursor] = useState<TypingMazePos>({ r: 0, c: 0 });
  /** 已通过的格子（高亮） */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startGuardRef = useRef(false);
  const finishGuardRef = useRef(false);
  const endedRef = useRef(false);
  const clearedCountRef = useRef(0);
  const clearedRef = useRef<Set<string>>(new Set());

  const isActiveGame = session?.status === 'playing' && !ended;
  const setupLocked = loading || settling || session?.status === 'playing';
  const extendFee = config?.extendFee ?? 5;
  const canExtend =
    isActiveGame
    && !!session
    && !settling
    && !extending
    && session.extendCount < session.maxExtends
    && (coins ?? 0) >= extendFee;

  useEffect(() => {
    if (!config) return;
    setModeId((prev) => prev || config.defaultModeId || 'maze');
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    setEnded(false);
    endedRef.current = false;
    finishGuardRef.current = false;
    setNotice('');
    setInput('');
    setClearedCount(0);
    clearedCountRef.current = 0;
    setCursor(session.start);
    const initial = session.modeId === 'maze' ? new Set([posKey(session.start)]) : new Set<string>();
    setCleared(initial);
    clearedRef.current = initial;
    onSelectCell(cellRef(session.start.r, session.start.c));
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [session?.sessionId, session?.status, onSelectCell]);

  useEffect(() => {
    if (!isActiveGame) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [isActiveGame]);

  const previewMode = config?.modes.find((item) => item.modeId === modeId);
  const activeModeId = isActiveGame ? (session?.modeId ?? modeId) : modeId;
  const mode = config?.modes.find((item) => item.modeId === activeModeId);
  const remainingMs = session ? Math.max(0, session.deadlineAt - now) : 0;

  const pureOrder = useMemo(
    () => (session?.modeId === 'pure' ? getPureOrder(session) : []),
    [session],
  );

  const pureTarget = useMemo(() => {
    if (!session || session.modeId !== 'pure') return null;
    return pureOrder[clearedCount] ?? null;
  }, [clearedCount, pureOrder, session]);

  const mazeNeighbors = useMemo(() => {
    if (!session || session.modeId !== 'maze' || !isActiveGame) return [];
    return getMazeNeighbors(session, cursor);
  }, [cursor, isActiveGame, session]);

  const finishGame = useCallback(async (result: 'won' | 'lost', message: string, count = clearedCountRef.current) => {
    if (endedRef.current || finishGuardRef.current) return;
    endedRef.current = true;
    finishGuardRef.current = true;
    setEnded(true);
    setNotice(message);
    setInput('');
    await onFinish(result, count);
  }, [onFinish]);

  useEffect(() => {
    if (!session || session.status !== 'playing' || ended) return;
    if (now <= session.deadlineAt) return;
    void finishGame('lost', '时间到，挑战失败');
  }, [ended, finishGame, now, session]);

  // 非对局时按当前模式下拉展示 demo；对局中用 session 尺寸
  const dataColCount = isActiveGame
    ? (session?.cols ?? previewMode?.cols ?? 14)
    : (previewMode?.cols ?? 14);
  const rows = isActiveGame
    ? (session?.rows ?? previewMode?.rows ?? 14)
    : (previewMode?.rows ?? 14);

  const demoBoard = useMemo(() => {
    if (isActiveGame) return null;
    const demoMode = (previewMode?.modeId ?? modeId) === 'pure' ? 'pure' : 'maze';
    return buildTypingMazeDemo(demoMode, rows, dataColCount);
  }, [dataColCount, isActiveGame, modeId, previewMode?.modeId, rows]);

  const filler = useCellFiller(wrapRef, rows, dataColCount, 88);
  const cols = useMemo(
    () => Array.from({ length: dataColCount + filler.cols }, (_, index) => COL_LABELS[index] ?? `C${index + 1}`),
    [dataColCount, filler.cols],
  );

  const clearInputKeepFocus = () => {
    setInput('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleStart = async () => {
    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if (setupLocked || startGuardRef.current) return;
    startGuardRef.current = true;
    try {
      const next = await onStart(modeId);
      if (next) setNotice('');
    } finally {
      window.setTimeout(() => {
        startGuardRef.current = false;
      }, 1000);
    }
  };

  const handleExtend = async () => {
    if (!canExtend) return;
    const next = await onExtend();
    if (next) {
      setNotice(`已延长 ${config?.extendSec ?? 30} 秒`);
      setNow(Date.now());
    }
  };

  const promptTargetHint = useMemo(() => {
    if (!isActiveGame || !session) return '';
    if (session.modeId === 'pure') {
      if (!pureTarget) return '已全部打完';
      const cell = getCell(session, pureTarget);
      return cell ? `请输入 ${cellRef(pureTarget.r, pureTarget.c)}：${cell.display}` : '';
    }
    return `当前位置 ${cellRef(cursor.r, cursor.c)} · 输入相邻格内容前进`;
  }, [cursor, isActiveGame, pureTarget, session]);

  const submitAnswer = () => {
    if (!session || session.status !== 'playing' || settling || endedRef.current) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    if (session.modeId === 'pure') {
      if (!pureTarget) return;
      const cell = getCell(session, pureTarget);
      if (!cell) return;
      if (!checkTypingAnswer(input, cell)) {
        setNotice(`打错了，请重试：${cellRef(pureTarget.r, pureTarget.c)}`);
        clearInputKeepFocus();
        return;
      }
      const nextCount = clearedCountRef.current + 1;
      clearedCountRef.current = nextCount;
      setClearedCount(nextCount);
      setCleared((prev) => {
        const next = new Set(prev).add(posKey(pureTarget));
        clearedRef.current = next;
        return next;
      });
      clearInputKeepFocus();
      setNotice('');
      if (nextCount >= pureOrder.length) {
        void finishGame('won', '全部打完，挑战成功！', nextCount);
        return;
      }
      const next = pureOrder[nextCount];
      if (next) onSelectCell(cellRef(next.r, next.c));
      return;
    }

    // maze：按输入内容匹配相邻方向，无需点选
    const matched = matchMazeNeighborByInput(session, cursor, input, clearedRef.current);
    if (!matched) {
      setNotice('与相邻路径格不匹配，请重试');
      clearInputKeepFocus();
      return;
    }
    const nextCount = clearedCountRef.current + 1;
    clearedCountRef.current = nextCount;
    setClearedCount(nextCount);
    setCleared((prev) => {
      const next = new Set(prev).add(posKey(matched));
      clearedRef.current = next;
      return next;
    });
    setCursor(matched);
    clearInputKeepFocus();
    setNotice('');
    onSelectCell(cellRef(matched.r, matched.c));
    if (matched.r === session.end.r && matched.c === session.end.c) {
      void finishGame('won', '抵达终点，挑战成功！', nextCount);
    }
  };

  const handleCellClick = (r: number, c: number, isFiller: boolean) => {
    const ref = cellRef(r, c);
    onSelectCell(ref);
    if (!isActiveGame || !session || isFiller || settling || endedRef.current) return;
    inputRef.current?.focus();
  };

  const neighborSet = useMemo(
    () => new Set(mazeNeighbors.map(posKey)),
    [mazeNeighbors],
  );

  return (
    <div className={styles.gridPane}>
      <div className={styles.llkToolbar}>
        <label>
          模式
          <select
            value={modeId}
            onChange={(event) => setModeId(event.target.value)}
            disabled={setupLocked}
          >
            {(config?.modes ?? []).map((item) => (
              <option key={item.modeId} value={item.modeId}>
                {item.name} · {item.entryFee} 金币
              </option>
            ))}
          </select>
        </label>
        {mode ? (
          <span className={styles.llkMeta}>
            限时{mode.timeLimitSec}s · 奖励{mode.rewardCoins}金币
          </span>
        ) : null}
        <button
          type="button"
          className={styles.llkStartBtn}
          onClick={() => void handleStart()}
          disabled={setupLocked || !config}
        >
          {loading ? '开局中' : settling ? '结算中' : '开始'}
        </button>
        {session?.status === 'playing' && !ended ? (
          <button
            type="button"
            className={styles.llkRefreshBtn}
            onClick={() => void handleExtend()}
            disabled={!canExtend}
            title={`消耗 ${extendFee} 金币延长 ${config?.extendSec ?? 30} 秒（剩余 ${Math.max(0, (session?.maxExtends ?? 0) - (session?.extendCount ?? 0))} 次）`}
          >
            {extending
              ? '延长中'
              : `延长器 · ${extendFee}金币（${Math.max(0, session.maxExtends - session.extendCount)}）`}
          </button>
        ) : null}
        <button type="button" className={styles.csToolBtn} onClick={() => setShowRules(true)}>
          玩法说明
        </button>
        {isActiveGame && session ? (
          <span className={styles.llkMeta}>
            剩余 {formatTypingMazeTime(remainingMs)}
            {' · '}
            进度 {clearedCount}
            {session.modeId === 'pure' ? `/${pureOrder.length || session.rows * session.cols}` : ''}
          </span>
        ) : null}
        {settling ? (
          <span className={styles.llkSettling}>结算中…</span>
        ) : notice ? (
          <span className={styles.llkNotice}>{notice}</span>
        ) : null}
      </div>

      {isActiveGame ? (
        <div className={styles.tmInputBar}>
          <span className={styles.tmHint}>{promptTargetHint}</span>
          <input
            ref={inputRef}
            className={styles.tmInput}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitAnswer();
              }
            }}
            placeholder="输入后按 Enter"
            disabled={settling || ended}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.llkStartBtn}
            onClick={submitAnswer}
            disabled={settling || ended}
          >
            确认
          </button>
        </div>
      ) : null}

      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.corner} />
        <div className={styles.colHeaders}>
          {cols.map((col, index) => (
            <div
              key={col}
              className={`${styles.colHeader}${index >= dataColCount ? ` ${styles.llkFillerColHeader}` : ''}`}
            >
              {col}
            </div>
          ))}
        </div>
        <div className={styles.body}>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <div key={rowIndex} className={`${styles.row} ${styles.llkRow}`}>
              <div className={styles.rowHeader}>{rowIndex + 1}</div>
              {cols.map((col, colIndex) => {
                const ref = `${col}${rowIndex + 1}`;
                const isFillerCol = colIndex >= dataColCount;
                const liveCell = isActiveGame && !isFillerCol && session?.board
                  ? session.board[rowIndex]?.[colIndex]
                  : null;
                const demoCell = !isActiveGame && !isFillerCol
                  ? demoBoard?.[rowIndex]?.[colIndex] ?? null
                  : null;
                const key = `${rowIndex},${colIndex}`;
                const isCurrent = isActiveGame && session?.modeId === 'maze'
                  && cursor.r === rowIndex && cursor.c === colIndex;
                const isPureTarget = isActiveGame && session?.modeId === 'pure'
                  && pureTarget?.r === rowIndex && pureTarget?.c === colIndex;
                const isNeighbor = isActiveGame && session?.modeId === 'maze' && neighborSet.has(key);
                const isCleared = isActiveGame && cleared.has(key);
                const isWall = Boolean(
                  isActiveGame
                    ? session?.modeId === 'maze' && !isFillerCol && !liveCell
                    : demoCell?.isWall,
                );
                const isEnd = Boolean(
                  isActiveGame
                    ? session
                      && !isFillerCol
                      && session.end.r === rowIndex
                      && session.end.c === colIndex
                    : demoCell?.isEnd,
                );

                let extra = '';
                if (isFillerCol) extra += ` ${styles.llkFillerCell}`;
                if (!isActiveGame) extra += ` ${styles.llkDemoCell}`;
                if (isWall) extra += ` ${styles.tmWall}`;
                if (isCleared && !isCurrent) extra += ` ${styles.tmCleared}`;
                if (isNeighbor) extra += ` ${styles.tmNeighbor}`;
                if (isCurrent || isPureTarget) extra += ` ${styles.selected}`;
                else if (ref === selectedCell) extra += ` ${styles.selected}`;
                if (isEnd) extra += ` ${styles.tmEnd}`;

                let cellText = '';
                if (!isFillerCol) {
                  if (isActiveGame) {
                    cellText = liveCell?.display
                      ?? (isWall ? wallDecoyNumber(rowIndex, colIndex) : '');
                  } else {
                    cellText = demoCell?.display ?? '';
                  }
                }

                return (
                  <button
                    key={ref}
                    type="button"
                    className={`${styles.cell} ${styles.llkCell} ${styles.tmCell}${extra}`}
                    onClick={() => handleCellClick(rowIndex, colIndex, isFillerCol)}
                    disabled={isFillerCol}
                    title={liveCell?.display ?? demoCell?.display}
                  >
                    <span className={styles.tmCellText}>{cellText}</span>
                  </button>
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
                <div className={styles.rowHeader}>{rowNum}</div>
                {cols.map((col) => (
                  <div key={`${col}${rowNum}`} className={`${styles.fillerCell} ${styles.llkFillerCell}`} />
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
              <h3 className={styles.csModalTitle}>打字迷宫 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: TYPING_MAZE_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
