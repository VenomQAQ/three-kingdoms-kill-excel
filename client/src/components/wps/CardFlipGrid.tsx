import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardFlipConfig, CardFlipDisplayMode, CardFlipSession, CardFlipTile } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import { buildDemoBoard, CARD_FLIP_RULES_HTML, formatCardFlipTime } from '../../utils/cardFlip';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface CardFlipGridProps {
  config: CardFlipConfig | null;
  session: CardFlipSession | null;
  loading: boolean;
  settling: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (themeId: string, difficultyId: string) => Promise<CardFlipSession | null>;
  onFinish: (result: 'won' | 'lost', remainingTiles: number) => Promise<void>;
  onRequireLogin: () => void;
}

const MISMATCH_FLIP_BACK_MS = 650;

export function CardFlipGrid({
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
}: CardFlipGridProps) {
  const [themeId, setThemeId] = useState('');
  const [difficultyId, setDifficultyId] = useState('');
  const [tiles, setTiles] = useState<CardFlipTile[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(false);
  const [displayMode, setDisplayMode] = useState<CardFlipDisplayMode>('text');
  const [notice, setNotice] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [winAt, setWinAt] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timeoutHandledRef = useRef(false);
  const startGuardRef = useRef(false);
  const flipBackTimerRef = useRef<number | null>(null);

  const isActiveGame = session?.status === 'playing';
  const setupLocked = loading || settling || isActiveGame;

  useEffect(() => {
    if (!config) return;
    setThemeId((prev) => prev || config.defaultThemeId);
    setDifficultyId((prev) => prev || config.defaultDifficultyId);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== 'playing') return;
    setTiles(session.board);
    setFlippedIds([]);
    setMatchedIds(new Set());
    setLocked(false);
    setNotice('');
    setWinAt(null);
    timeoutHandledRef.current = false;
    if (flipBackTimerRef.current != null) {
      window.clearTimeout(flipBackTimerRef.current);
      flipBackTimerRef.current = null;
    }
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

  useEffect(() => () => {
    if (flipBackTimerRef.current != null) window.clearTimeout(flipBackTimerRef.current);
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'playing' || tiles.length === 0 || winAt != null) return;
    if (now <= session.deadlineAt) return;
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setNotice('时间到，挑战失败');
    const remaining = tiles.length - matchedIds.size;
    void onFinish('lost', remaining);
  }, [matchedIds.size, now, onFinish, session, tiles.length, winAt]);

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
  const matchedCount = matchedIds.size / 2;
  const totalPairs = tiles.length / 2;

  const dataColCount = isActiveGame
    ? (session?.cols ?? previewDifficulty?.cols ?? 4)
    : (previewDifficulty?.cols ?? 4);
  const rows = isActiveGame
    ? (session?.rows ?? previewDifficulty?.rows ?? 4)
    : (previewDifficulty?.rows ?? 4);
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

  const handleTile = (tile: CardFlipTile) => {
    if (!session || session.status !== 'playing' || settling || locked) return;
    if (matchedIds.has(tile.tileId)) return;
    if (flippedIds.includes(tile.tileId)) return;
    if (flippedIds.length >= 2) return;

    const nextFlipped = [...flippedIds, tile.tileId];
    setFlippedIds(nextFlipped);
    setNotice('');

    if (nextFlipped.length < 2) return;

    const first = activeMap.get(nextFlipped[0]!);
    const second = activeMap.get(nextFlipped[1]!);
    if (!first || !second) {
      setFlippedIds([]);
      return;
    }

    if (first.itemId === second.itemId) {
      const nextMatched = new Set(matchedIds);
      nextMatched.add(first.tileId);
      nextMatched.add(second.tileId);
      setMatchedIds(nextMatched);
      setFlippedIds([]);
      const remaining = tiles.length - nextMatched.size;
      if (remaining === 0) {
        timeoutHandledRef.current = true;
        setWinAt(Date.now());
        setNotice('挑战成功');
        void onFinish('won', 0);
      } else {
        setNotice(`配对成功 · ${nextMatched.size / 2}/${totalPairs}`);
      }
      return;
    }

    setLocked(true);
    setNotice('未配对，翻回');
    flipBackTimerRef.current = window.setTimeout(() => {
      setFlippedIds([]);
      setLocked(false);
      setNotice('');
      flipBackTimerRef.current = null;
    }, MISMATCH_FLIP_BACK_MS);
  };

  const renderFace = (tile: CardFlipTile | undefined, revealed: boolean) => {
    if (!tile) return '';
    if (!revealed) {
      return <span className={styles.cardFlipBack}>?</span>;
    }
    const item = itemMap.get(tile.itemId);
    if (!item) return '';
    return displayMode === 'icon'
      ? <span className={styles.llkEmoji}>{item.emoji}</span>
      : <span>{item.text}</span>;
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
        <div className={styles.llkSegmented} aria-label="展示模式">
          <button
            type="button"
            className={displayMode === 'icon' ? styles.llkSegmentActive : ''}
            onClick={() => setDisplayMode('icon')}
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
        <button type="button" className={styles.csToolBtn} onClick={() => setShowRules(true)}>
          玩法说明
        </button>
        {session ? (
          <span className={styles.llkMeta}>
            剩余 {formatCardFlipTime(remainingMs)}
            {showElapsed ? ` · 消耗 ${formatCardFlipTime(elapsedMs)}` : ''}
            {isActiveGame && totalPairs > 0 ? ` · 配对 ${matchedCount}/${totalPairs}` : ''}
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
                const isMatched = tile ? matchedIds.has(tile.tileId) : false;
                const isFlipped = tile ? flippedIds.includes(tile.tileId) : false;
                const revealed = !isActiveGame || isMatched || isFlipped;
                const isPlayable = isActiveGame && tile && !isFillerCol && !isMatched && !locked;
                return (
                  <button
                    key={ref}
                    type="button"
                    className={[
                      styles.cell,
                      styles.llkCell,
                      styles.cardFlipCell,
                      isFillerCol ? styles.llkFillerCell : '',
                      !isActiveGame && tile ? styles.llkDemoCell : '',
                      ref === selectedCell ? styles.selected : '',
                      isFlipped ? styles.cardFlipOpen : '',
                      isMatched ? styles.cardFlipMatched : '',
                      isActiveGame && tile && !revealed ? styles.cardFlipFaceDown : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      onSelectCell(ref);
                      if (isPlayable) handleTile(tile);
                    }}
                    disabled={!tile || isFillerCol || (isActiveGame && isMatched)}
                    title={revealed ? item?.text : '未翻开'}
                  >
                    {renderFace(tile, revealed)}
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
              <h3 className={styles.csModalTitle}>翻牌游戏 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: CARD_FLIP_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
