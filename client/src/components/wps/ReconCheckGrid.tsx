import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReconCheckConfig, ReconCheckSession } from '@tk/shared';
import {
  buildDemoBoards,
  findDiffKeys,
  formatReconTime,
  RECON_CHECK_RULES_HTML,
  reconCellKey,
  reconDisplayGlyph,
  reconSheetLayout,
} from '../../utils/reconCheck';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

const CELL_W = 48;
const CELL_H = 22;

function spreadsheetColumnLabel(index: number): string {
  let label = '';
  let current = index;
  while (current >= 0) {
    label = String.fromCharCode('A'.charCodeAt(0) + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  }
  return label;
}

interface ReconCheckGridProps {
  config: ReconCheckConfig | null;
  session: ReconCheckSession | null;
  loading: boolean;
  settling: boolean;
  extending: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (difficultyId: string) => Promise<ReconCheckSession | null>;
  onExtend: () => Promise<ReconCheckSession | null>;
  onFinish: (result: 'won' | 'lost', foundByRound: string[][], wrongClicks: number) => Promise<void>;
  onRequireLogin: () => void;
}

type SheetZone =
  | { kind: 'left'; boardRow: number; boardCol: number }
  | { kind: 'right'; boardRow: number; boardCol: number }
  | { kind: 'gap' }
  | { kind: 'filler' };

export function ReconCheckGrid({
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
}: ReconCheckGridProps) {
  const [difficultyId, setDifficultyId] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [roundIndex, setRoundIndex] = useState(0);
  const [foundKeys, setFoundKeys] = useState<string[]>([]);
  const [wrongMarked, setWrongMarked] = useState<string[]>([]);
  const [wrongClicks, setWrongClicks] = useState(0);
  const [ended, setEnded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const startGuardRef = useRef(false);
  const finishGuardRef = useRef(false);
  const endedRef = useRef(false);
  const foundByRoundRef = useRef<string[][]>([]);
  const wrongClicksRef = useRef(0);

  const isActiveGame = session?.status === 'playing' && !ended;
  const setupLocked = loading || settling || session?.status === 'playing';
  const maxWrongClicks = session?.maxWrongClicks ?? config?.maxWrongClicks ?? 3;
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
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    setRoundIndex(0);
    setFoundKeys([]);
    setWrongMarked([]);
    foundByRoundRef.current = [];
    setWrongClicks(0);
    wrongClicksRef.current = 0;
    setEnded(false);
    endedRef.current = false;
    finishGuardRef.current = false;
    setNotice('');
    setNow(Date.now());
  }, [session?.sessionId, session?.status]);

  useEffect(() => {
    if (!isActiveGame) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [isActiveGame]);

  const previewDifficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId);
  const activeDifficultyId = isActiveGame ? (session?.difficultyId ?? difficultyId) : difficultyId;
  const difficulty = config?.difficulties.find((item) => item.difficultyId === activeDifficultyId);

  const demoBoard = useMemo(
    () => buildDemoBoards(config, difficultyId || config?.defaultDifficultyId || 'easy'),
    [config, difficultyId],
  );

  const currentBoard = isActiveGame && session
    ? (session.boards[roundIndex] ?? demoBoard)
    : demoBoard;

  const answerKeys = useMemo(
    () => findDiffKeys(currentBoard.left, currentBoard.right),
    [currentBoard],
  );

  const boardRows = isActiveGame
    ? (session?.rows ?? previewDifficulty?.rows ?? 6)
    : (previewDifficulty?.rows ?? 6);
  const boardCols = isActiveGame
    ? (session?.cols ?? previewDifficulty?.cols ?? 5)
    : (previewDifficulty?.cols ?? 5);

  // 数据从第 1 行起：左盘 | 空白列 | 右盘（无标题行）
  const dataRows = boardRows;
  const { gapCol, rightStart, dataColCount } = reconSheetLayout(boardCols);
  const filler = useCellFiller(wrapRef, dataRows, dataColCount, CELL_W, CELL_H);
  const totalCols = dataColCount + filler.cols;

  const colLabels = useMemo(
    () => Array.from({ length: totalCols }, (_, index) => spreadsheetColumnLabel(index)),
    [totalCols],
  );

  const remainingMs = session ? Math.max(0, session.deadlineAt - now) : 0;
  const totalRounds = session?.rounds ?? difficulty?.rounds ?? 3;
  const diffsPerRound = session?.diffsPerRound ?? difficulty?.diffsPerRound ?? answerKeys.length;

  const finishGame = useCallback(async (
    result: 'won' | 'lost',
    message: string,
    roundsFound = foundByRoundRef.current,
    wrong = wrongClicksRef.current,
  ) => {
    if (endedRef.current || finishGuardRef.current) return;
    endedRef.current = true;
    finishGuardRef.current = true;
    setEnded(true);
    setNotice(message);
    await onFinish(result, roundsFound, wrong);
  }, [onFinish]);

  useEffect(() => {
    if (!session || session.status !== 'playing' || ended) return;
    if (now <= session.deadlineAt) return;
    void finishGame('lost', '时间到，核对失败');
  }, [ended, finishGame, now, session]);

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

  const handleExtend = async () => {
    if (!canExtend) return;
    const next = await onExtend();
    if (next) {
      setNotice(`已延长 ${config?.extendSec ?? 15} 秒`);
      setNow(Date.now());
    }
  };

  const advanceOrWin = useCallback((
    nextFoundByRound: string[][],
    nextRoundIndex: number,
  ) => {
    if (!session) return;
    if (nextRoundIndex + 1 >= session.rounds) {
      void finishGame('won', '核对通过！全部差异已找出', nextFoundByRound, wrongClicksRef.current);
      return;
    }
    setRoundIndex(nextRoundIndex + 1);
    setFoundKeys([]);
    setWrongMarked([]);
    setNotice(`第 ${nextRoundIndex + 1} 轮完成，进入下一轮`);
  }, [finishGame, session]);

  const handleBoardClick = (boardRow: number, boardCol: number) => {
    if (!session || session.status !== 'playing' || settling || endedRef.current) return;
    const key = reconCellKey(boardRow, boardCol);
    if (foundKeys.includes(key) || wrongMarked.includes(key)) return;

    if (answerKeys.includes(key)) {
      const nextFound = [...foundKeys, key];
      setFoundKeys(nextFound);
      if (nextFound.length >= answerKeys.length) {
        const nextFoundByRound = [...foundByRoundRef.current];
        nextFoundByRound[roundIndex] = [...nextFound].sort();
        foundByRoundRef.current = nextFoundByRound;
        advanceOrWin(nextFoundByRound, roundIndex);
      }
      return;
    }

    setWrongMarked((prev) => [...prev, key]);
    const nextWrong = wrongClicksRef.current + 1;
    wrongClicksRef.current = nextWrong;
    setWrongClicks(nextWrong);
    if (nextWrong > maxWrongClicks) {
      void finishGame('lost', `失误超过 ${maxWrongClicks} 次，核对失败`);
    } else {
      setNotice(`点错了 · 失误 ${nextWrong}/${maxWrongClicks}`);
    }
  };

  const resolveZone = (sheetRow: number, sheetCol: number): SheetZone => {
    if (sheetCol >= dataColCount) return { kind: 'filler' };
    if (sheetCol === gapCol) return { kind: 'gap' };
    if (sheetRow < 0 || sheetRow >= boardRows) return { kind: 'filler' };
    if (sheetCol < boardCols) {
      return { kind: 'left', boardRow: sheetRow, boardCol: sheetCol };
    }
    if (sheetCol >= rightStart && sheetCol < rightStart + boardCols) {
      return { kind: 'right', boardRow: sheetRow, boardCol: sheetCol - rightStart };
    }
    return { kind: 'filler' };
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
                {item.name} · 每轮{item.diffsPerRound}处 · {item.entryFee}金币
              </option>
            ))}
          </select>
        </label>
        {difficulty ? (
          <span className={styles.llkMeta}>
            单侧{difficulty.rows}×{difficulty.cols}
            {' · '}
            {difficulty.rounds} 轮
            {' · '}
            每轮{difficulty.diffsPerRound}处差异
            {' · '}
            奖励{difficulty.rewardCoins}金币
          </span>
        ) : null}
        <button
          type="button"
          className={styles.llkStartBtn}
          onClick={() => void handleStart()}
          disabled={setupLocked || !config}
        >
          {loading ? '开局中' : settling ? '结算中' : '开始核对'}
        </button>
        {session?.status === 'playing' && !ended ? (
          <button
            type="button"
            className={styles.llkRefreshBtn}
            onClick={() => void handleExtend()}
            disabled={!canExtend}
            title={`消耗 ${extendFee} 金币延长 ${config?.extendSec ?? 15} 秒（剩余 ${Math.max(0, (session?.maxExtends ?? 0) - (session?.extendCount ?? 0))} 次）`}
          >
            {extending
              ? '延长中'
              : `延长器 · ${extendFee}金币（${Math.max(0, session.maxExtends - session.extendCount)}）`}
          </button>
        ) : null}
        <button type="button" className={styles.csToolBtn} onClick={() => setShowRules(true)}>
          玩法说明
        </button>
        {session ? (
          <span className={styles.llkMeta}>
            剩余 {formatReconTime(remainingMs)}
            {' · '}
            第 {Math.min(roundIndex + 1, totalRounds)}/{totalRounds} 轮
            {' · '}
            差异 {foundKeys.length}/{Math.max(diffsPerRound, answerKeys.length)}
            {' · '}
            失误 {wrongClicks}/{maxWrongClicks}
          </span>
        ) : (
          <span className={styles.llkMeta}>
            预览 · 本档每轮 {previewDifficulty?.diffsPerRound ?? diffsPerRound} 处差异
          </span>
        )}
        {settling ? (
          <span className={styles.llkSettling}>结算中…</span>
        ) : notice ? (
          <span className={styles.llkNotice}>{notice}</span>
        ) : null}
      </div>

      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.corner} />
        <div className={styles.colHeaders}>
          {colLabels.map((col, index) => (
            <div
              key={col}
              className={`${styles.colHeader} ${styles.reconSheetColHeader}${index === gapCol ? ` ${styles.reconGapHeader}` : ''}`}
            >
              {col}
            </div>
          ))}
        </div>
        <div className={styles.body}>
          {Array.from({ length: dataRows }, (_, sheetRow) => (
            <div key={sheetRow} className={`${styles.row} ${styles.reconSheetRow}`}>
              <div className={styles.rowHeader}>{sheetRow + 1}</div>
              {colLabels.map((col, sheetCol) => {
                const ref = `${col}${sheetRow + 1}`;
                const zone = resolveZone(sheetRow, sheetCol);
                const isSelected = ref === selectedCell;

                if (zone.kind === 'filler') {
                  return (
                    <div
                      key={ref}
                      className={`${styles.reconSheetCell}`}
                    />
                  );
                }

                if (zone.kind === 'gap') {
                  return (
                    <button
                      key={ref}
                      type="button"
                      className={`${styles.reconSheetCell} ${styles.reconGapCell} ${isSelected ? styles.selected : ''}`}
                      onClick={() => onSelectCell(ref)}
                    />
                  );
                }

                const ch = zone.kind === 'left'
                  ? (currentBoard.left[zone.boardRow]?.[zone.boardCol] ?? '')
                  : (currentBoard.right[zone.boardRow]?.[zone.boardCol] ?? '');
                const key = reconCellKey(zone.boardRow, zone.boardCol);
                const isFound = foundKeys.includes(key);
                const isWrong = wrongMarked.includes(key);
                const playable = Boolean(isActiveGame);

                return (
                  <button
                    key={ref}
                    type="button"
                    className={[
                      styles.reconSheetCell,
                      !isActiveGame ? styles.llkDemoCell : '',
                      isFound ? styles.reconFound : '',
                      isWrong ? styles.reconWrong : '',
                      isSelected ? styles.selected : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      onSelectCell(ref);
                      if (playable) handleBoardClick(zone.boardRow, zone.boardCol);
                    }}
                  >
                    <span className={styles.reconGlyph}>
                      {reconDisplayGlyph(ch, 'text')}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {Array.from({ length: filler.rows }, (_, index) => {
            const rowNum = dataRows + index + 1;
            const isLastRow = index === filler.rows - 1;
            return (
              <div
                key={`filler-${rowNum}`}
                className={`${styles.row} ${styles.fillerRow}${isLastRow ? ` ${styles.fillerRowStretch}` : ''}`}
              >
                <div className={styles.rowHeader}>{rowNum}</div>
                {colLabels.map((col) => (
                  <div
                    key={`${col}${rowNum}`}
                    className={styles.reconSheetCell}
                  />
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
              <h3 className={styles.csModalTitle}>对账校验 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: RECON_CHECK_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
