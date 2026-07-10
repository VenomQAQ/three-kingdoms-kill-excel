import { useEffect, useMemo, useRef, useState } from 'react';
import type { LianliankanConfig, LianliankanDisplayMode, LianliankanSession, LianliankanTile } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import { buildDemoBoard, canConnect, formatLianliankanTime } from '../../utils/lianliankan';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface LianliankanGridProps {
  config: LianliankanConfig | null;
  session: LianliankanSession | null;
  loading: boolean;
  settling: boolean;
  refreshing: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (themeId: string, difficultyId: string) => Promise<LianliankanSession | null>;
  onFinish: (result: 'won' | 'lost', remainingTiles: number) => Promise<void>;
  onRefresh: (remainingTiles: LianliankanTile[]) => Promise<LianliankanSession | null>;
  onRequireLogin: () => void;
}

export function LianliankanGrid({
  config,
  session,
  loading,
  settling,
  refreshing,
  selectedCell,
  isAuthed,
  coins,
  onSelectCell,
  onStart,
  onFinish,
  onRefresh,
  onRequireLogin,
}: LianliankanGridProps) {
  const [themeId, setThemeId] = useState('');
  const [difficultyId, setDifficultyId] = useState('');
  const [tiles, setTiles] = useState<LianliankanTile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<LianliankanDisplayMode>('text');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [winAt, setWinAt] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timeoutHandledRef = useRef(false);
  const startGuardRef = useRef(false);

  const isActiveGame = session?.status === 'playing';
  const setupLocked = loading || settling || isActiveGame;
  const refreshFee = config?.refreshFee ?? 5;
  const canRefresh =
    isActiveGame
    && !!session
    && !settling
    && !refreshing
    && !session.refreshUsed
    && tiles.length > 0
    && (coins ?? 0) >= refreshFee;

  useEffect(() => {
    if (!config) return;
    setThemeId((prev) => prev || config.defaultThemeId);
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    setTiles(session.board);
    setSelectedTileId(null);
    setNotice('');
    setWinAt(null);
    timeoutHandledRef.current = false;
  }, [session?.sessionId, session?.status, session?.board]);

  useEffect(() => {
    if (session?.status === 'won' && session.finishedAt && winAt == null) {
      setWinAt(session.finishedAt);
    }
  }, [session?.status, session?.finishedAt, winAt]);

  useEffect(() => {
    if (!isActiveGame || winAt != null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [isActiveGame, winAt]);

  useEffect(() => {
    if (!session || session.status !== 'playing' || tiles.length === 0 || winAt != null) return;
    if (now <= session.deadlineAt) return;
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setNotice('时间到，挑战失败');
    void onFinish('lost', tiles.length);
  }, [now, onFinish, session, tiles.length, winAt]);

  const previewTheme = config?.themes.find((item) => item.themeId === themeId);
  const previewDifficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId);
  const activeThemeId = isActiveGame ? (session?.themeId ?? themeId) : themeId;
  const activeDifficultyId = isActiveGame ? (session?.difficultyId ?? difficultyId) : difficultyId;
  const theme = config?.themes.find((item) => item.themeId === activeThemeId);
  const difficulty = config?.difficulties.find((item) => item.difficultyId === activeDifficultyId);
  const itemMap = useMemo(() => new Map(theme?.items.map((item) => [item.id, item]) ?? []), [theme]);

  const demoTiles = useMemo(() => {
    if (!previewTheme || !previewDifficulty) return [];
    return buildDemoBoard(
      previewTheme.items.map((item) => item.id),
      previewDifficulty.rows,
      previewDifficulty.cols,
      previewDifficulty.kindCount,
    );
  }, [previewTheme, previewDifficulty]);

  const displayTiles = isActiveGame ? tiles : demoTiles;
  const tileMap = useMemo(
    () => new Map(displayTiles.map((tile) => [`${tile.row},${tile.col}`, tile])),
    [displayTiles],
  );
  const activeMap = useMemo(() => new Map(tiles.map((tile) => [tile.tileId, tile])), [tiles]);

  const clockAt = winAt ?? now;
  const remainingMs = session ? Math.max(0, session.deadlineAt - clockAt) : 0;
  const elapsedMs = session && winAt != null ? winAt - session.startedAt : 0;
  const showElapsed = winAt != null;

  const dataColCount = isActiveGame
    ? (session?.cols ?? previewDifficulty?.cols ?? 8)
    : (previewDifficulty?.cols ?? 8);
  const rows = isActiveGame
    ? (session?.rows ?? previewDifficulty?.rows ?? 8)
    : (previewDifficulty?.rows ?? 8);
  const filler = useCellFiller(wrapRef, rows, dataColCount, 92);
  const cols = useMemo(
    () => Array.from({ length: dataColCount + filler.cols }, (_, index) => COL_LABELS[index] ?? `C${index + 1}`),
    [dataColCount, filler.cols],
  );

  const handleStart = async () => {
    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if (setupLocked || startGuardRef.current) return;
    startGuardRef.current = true;
    try {
      const next = await onStart(themeId, difficultyId);
      if (next) setNotice('');
    } finally {
      window.setTimeout(() => {
        startGuardRef.current = false;
      }, 1000);
    }
  };

  const handleRefresh = async () => {
    if (!canRefresh) return;
    const next = await onRefresh(tiles);
    if (next) {
      setSelectedTileId(null);
      setNotice('棋盘已重新排列');
    }
  };

  const handleTile = (tile: LianliankanTile) => {
    if (!session || session.status !== 'playing' || settling || refreshing) return;
    if (!selectedTileId) {
      setSelectedTileId(tile.tileId);
      return;
    }
    const first = activeMap.get(selectedTileId);
    if (!first || first.tileId === tile.tileId) {
      setSelectedTileId(null);
      return;
    }
    // 不同图案：静默切换选中，不提示
    if (first.itemId !== tile.itemId) {
      setSelectedTileId(tile.tileId);
      setNotice('');
      return;
    }
    const board = new Map(tiles.map((entry) => [entry.tileId, entry]));
    if (!canConnect(board, first, tile)) {
      setNotice('这对还连不上');
      setSelectedTileId(tile.tileId);
      return;
    }
    const nextTiles = tiles.filter((entry) => entry.tileId !== first.tileId && entry.tileId !== tile.tileId);
    setTiles(nextTiles);
    setSelectedTileId(null);
    setNotice(nextTiles.length === 0 ? '挑战成功' : '');
    if (nextTiles.length === 0) {
      timeoutHandledRef.current = true;
      setWinAt(Date.now());
      void onFinish('won', 0);
    }
  };

  return (
    <div className={styles.gridPane}>
      <div className={styles.llkToolbar}>
        <label>
          主题
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)} disabled={setupLocked}>
            {(config?.themes ?? []).map((item) => (
              <option key={item.themeId} value={item.themeId}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)} disabled={setupLocked}>
            {(config?.difficulties ?? []).map((item) => (
              <option key={item.difficultyId} value={item.difficultyId}>
                {item.name} · {item.entryFee} 金币
              </option>
            ))}
          </select>
        </label>
        {difficulty ? <span className={styles.llkMeta}>通关奖励{difficulty.rewardCoins}金币</span> : null}
        <button type="button" className={styles.llkStartBtn} onClick={handleStart} disabled={setupLocked || !config}>
          {loading ? '开局中' : settling ? '结算中' : '开始'}
        </button>
        {isActiveGame ? (
          <button
            type="button"
            className={styles.llkRefreshBtn}
            onClick={() => void handleRefresh()}
            disabled={!canRefresh}
            title={session?.refreshUsed ? '本局已刷新过' : `消耗 ${refreshFee} 金币重新排列剩余格子`}
          >
            {refreshing ? '刷新中' : session?.refreshUsed ? '已刷新' : `刷新 · ${refreshFee}金币`}
          </button>
        ) : null}
        <div className={styles.llkSegmented} aria-label="展示模式">
          <button
            type="button"
            className={displayMode === 'emoji' ? styles.llkSegmentActive : ''}
            onClick={() => setDisplayMode('emoji')}
          >
            图标
          </button>
          <button
            type="button"
            className={displayMode === 'text' ? styles.llkSegmentActive : ''}
            onClick={() => setDisplayMode('text')}
          >
            文字
          </button>
        </div>
        <span className={styles.llkMeta}>当前余额：{coins ?? 0}</span>
        {session ? (
          <span className={styles.llkMeta}>
            剩余 {formatLianliankanTime(remainingMs)}
            {showElapsed ? ` · 消耗 ${formatLianliankanTime(elapsedMs)}` : ''}
          </span>
        ) : null}
        {settling ? (
          <span className={styles.llkSettling}>结算中…</span>
        ) : notice ? (
          <span className={styles.llkNotice}>{notice}</span>
        ) : null}
      </div>
      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.corner} />
        <div className={styles.colHeaders}>
          {cols.map((col, index) => (
            <div
              key={col}
              className={`${styles.colHeader} ${styles.llkColHeader}${index >= dataColCount ? ` ${styles.llkFillerColHeader}` : ''}`}
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
                const tile = tileMap.get(`${rowIndex},${colIndex}`);
                const item = tile ? itemMap.get(tile.itemId) : null;
                const isFillerCol = colIndex >= dataColCount;
                const isPlayable = isActiveGame && tile && !isFillerCol;
                return (
                  <button
                    key={ref}
                    type="button"
                    className={`${styles.cell} ${styles.llkCell} ${isFillerCol ? styles.llkFillerCell : ''} ${!isActiveGame && tile ? styles.llkDemoCell : ''} ${ref === selectedCell ? styles.selected : ''} ${tile?.tileId === selectedTileId ? styles.llkTileSelected : ''}`}
                    onClick={() => {
                      onSelectCell(ref);
                      if (isPlayable) handleTile(tile);
                    }}
                    disabled={!tile || isFillerCol}
                    title={item?.text}
                  >
                    {item ? (
                      displayMode === 'emoji'
                        ? <span className={styles.llkEmoji}>{item.emoji}</span>
                        : <span>{item.text}</span>
                    ) : ''}
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
    </div>
  );
}
