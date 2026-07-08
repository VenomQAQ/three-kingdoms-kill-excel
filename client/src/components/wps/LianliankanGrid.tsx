import { useEffect, useMemo, useRef, useState } from 'react';
import type { LianliankanConfig, LianliankanDisplayMode, LianliankanSession, LianliankanTile } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import { canConnect } from '../../utils/lianliankan';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface LianliankanGridProps {
  config: LianliankanConfig | null;
  session: LianliankanSession | null;
  loading: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (themeId: string, difficultyId: string) => Promise<LianliankanSession | null>;
  onFinish: (result: 'won' | 'lost', remainingTiles: number) => Promise<void>;
  onRequireLogin: () => void;
}

export function mismatchNotice(isSameItem: boolean): string {
  return isSameItem ? '这对还连不上' : '请选择相同图案';
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function LianliankanGrid({
  config,
  session,
  loading,
  selectedCell,
  isAuthed,
  coins,
  onSelectCell,
  onStart,
  onFinish,
  onRequireLogin,
}: LianliankanGridProps) {
  const [themeId, setThemeId] = useState('');
  const [difficultyId, setDifficultyId] = useState('');
  const [tiles, setTiles] = useState<LianliankanTile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<LianliankanDisplayMode>('emoji');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timeoutHandledRef = useRef(false);

  useEffect(() => {
    if (!config) return;
    setThemeId((prev) => prev || config.defaultThemeId);
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    setTiles(session?.board ?? []);
    setSelectedTileId(null);
    setNotice('');
    timeoutHandledRef.current = false;
  }, [session?.sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'playing' || tiles.length === 0) return;
    if (now <= session.deadlineAt) return;
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setNotice('时间到，挑战失败');
    void onFinish('lost', tiles.length);
  }, [now, onFinish, session, tiles.length]);

  const theme = config?.themes.find((item) => item.themeId === (session?.themeId ?? themeId));
  const difficulty = config?.difficulties.find((item) => item.difficultyId === (session?.difficultyId ?? difficultyId));
  const itemMap = useMemo(() => new Map(theme?.items.map((item) => [item.id, item]) ?? []), [theme]);
  const tileMap = useMemo(() => new Map(tiles.map((tile) => [`${tile.row},${tile.col}`, tile])), [tiles]);
  const activeMap = useMemo(() => new Map(tiles.map((tile) => [tile.tileId, tile])), [tiles]);
  const remainingMs = session ? session.deadlineAt - now : 0;
  const dataColCount = session?.cols ?? difficulty?.cols ?? 8;
  const rows = session?.rows ?? difficulty?.rows ?? 8;
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
    const next = await onStart(themeId, difficultyId);
    if (next) setNotice('');
  };

  const handleTile = (tile: LianliankanTile) => {
    if (!session || session.status !== 'playing') return;
    if (!selectedTileId) {
      setSelectedTileId(tile.tileId);
      return;
    }
    const first = activeMap.get(selectedTileId);
    if (!first || first.tileId === tile.tileId) {
      setSelectedTileId(null);
      return;
    }
    const board = new Map(tiles.map((entry) => [entry.tileId, entry]));
    if (!canConnect(board, first, tile)) {
      setNotice(mismatchNotice(first.itemId === tile.itemId));
      setSelectedTileId(tile.tileId);
      return;
    }
    const nextTiles = tiles.filter((entry) => entry.tileId !== first.tileId && entry.tileId !== tile.tileId);
    setTiles(nextTiles);
    setSelectedTileId(null);
    setNotice(nextTiles.length === 0 ? '挑战成功' : '');
    if (nextTiles.length === 0) {
      timeoutHandledRef.current = true;
      void onFinish('won', 0);
    }
  };

  return (
    <div className={styles.gridPane}>
      <div className={styles.llkToolbar}>
        <label>
          主题
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)} disabled={loading}>
            {(config?.themes ?? []).map((item) => (
              <option key={item.themeId} value={item.themeId}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)} disabled={loading}>
            {(config?.difficulties ?? []).map((item) => (
              <option key={item.difficultyId} value={item.difficultyId}>
                {item.name} · {item.entryFee} 金币
              </option>
            ))}
          </select>
        </label>
        {difficulty ? <span className={styles.llkMeta}>通关奖励{difficulty.rewardCoins}金币</span> : null}
        <button type="button" className={styles.llkStartBtn} onClick={handleStart} disabled={loading || !config}>
          {loading ? '开局中' : '开始'}
        </button>
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
        {session ? <span className={styles.llkMeta}>剩余 {formatTime(remainingMs)}</span> : null}
        {notice ? <span className={styles.llkNotice}>{notice}</span> : null}
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
                return (
                  <button
                    key={ref}
                    type="button"
                    className={`${styles.cell} ${styles.llkCell} ${isFillerCol ? styles.llkFillerCell : ''} ${ref === selectedCell ? styles.selected : ''} ${tile?.tileId === selectedTileId ? styles.llkTileSelected : ''}`}
                    onClick={() => {
                      onSelectCell(ref);
                      if (tile) handleTile(tile);
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
