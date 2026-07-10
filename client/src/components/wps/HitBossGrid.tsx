import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HitBossConfig, HitBossDisplayMode, HitBossSession } from '@tk/shared';
import { COL_LABELS } from '../../data/decoy';
import {
  buildNumberBoard,
  createSpawn,
  formatHitBossTime,
  HIT_BOSS_ICONS,
  HIT_BOSS_LABELS,
  HIT_BOSS_RULES_HTML,
  type HitBossSpawn,
  isMissKind,
  pickSpawnKind,
  randomLifetimeMs,
} from '../../utils/hitBoss';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

interface HitBossGridProps {
  config: HitBossConfig | null;
  session: HitBossSession | null;
  loading: boolean;
  settling: boolean;
  extending: boolean;
  selectedCell: string;
  isAuthed: boolean;
  coins?: number;
  onSelectCell: (ref: string) => void;
  onStart: (difficultyId: string) => Promise<HitBossSession | null>;
  onExtend: () => Promise<HitBossSession | null>;
  onFinish: (result: 'won' | 'lost', bossesHit: number, missHits: number) => Promise<void>;
  onRequireLogin: () => void;
}

export function HitBossGrid({
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
}: HitBossGridProps) {
  const [difficultyId, setDifficultyId] = useState('');
  const [displayMode, setDisplayMode] = useState<HitBossDisplayMode>('text');
  const [showRules, setShowRules] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [board, setBoard] = useState<number[][]>([]);
  const [spawns, setSpawns] = useState<HitBossSpawn[]>([]);
  const [bossesHit, setBossesHit] = useState(0);
  const [missHits, setMissHits] = useState(0);
  const [ended, setEnded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const startGuardRef = useRef(false);
  const finishGuardRef = useRef(false);
  const bossesHitRef = useRef(0);
  const missHitsRef = useRef(0);
  const bossesSpawnedRef = useRef(0);
  const endedRef = useRef(false);

  const isActiveGame = session?.status === 'playing' && !ended;
  const setupLocked = loading || settling || session?.status === 'playing';
  const extendFee = config?.extendFee ?? 5;
  const maxMissHits = config?.maxMissHits ?? 3;
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
    const numbers = buildNumberBoard(session.rows, session.cols, Date.now());
    setBoard(numbers);
    setSpawns([]);
    setBossesHit(0);
    setMissHits(0);
    setEnded(false);
    setNotice('');
    bossesHitRef.current = 0;
    missHitsRef.current = 0;
    bossesSpawnedRef.current = 0;
    endedRef.current = false;
    finishGuardRef.current = false;
  }, [session?.sessionId, session?.status]);

  useEffect(() => {
    if (!isActiveGame) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [isActiveGame]);

  const previewDifficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId);
  const activeDifficultyId = isActiveGame ? (session?.difficultyId ?? difficultyId) : difficultyId;
  const difficulty = config?.difficulties.find((item) => item.difficultyId === activeDifficultyId);

  const remainingMs = session ? Math.max(0, session.deadlineAt - now) : 0;

  const finishGame = useCallback(async (
    result: 'won' | 'lost',
    message: string,
    hit = bossesHitRef.current,
    miss = missHitsRef.current,
  ) => {
    if (endedRef.current || finishGuardRef.current) return;
    endedRef.current = true;
    finishGuardRef.current = true;
    setEnded(true);
    setSpawns([]);
    setNotice(message);
    await onFinish(result, hit, miss);
  }, [onFinish]);

  // 超时
  useEffect(() => {
    if (!session || session.status !== 'playing' || ended) return;
    if (now <= session.deadlineAt) return;
    void finishGame('lost', '时间到，挑战失败');
  }, [ended, finishGame, now, session]);

  // 生成调度
  useEffect(() => {
    if (!session || session.status !== 'playing' || ended || !config) return undefined;

    const tick = () => {
      if (endedRef.current) return;
      const t = Date.now();
      if (t > session.deadlineAt) return;

      setSpawns((prev) => {
        const alive = prev.filter((spawn) => spawn.expiresAt > t);
        const occupied = new Set(alive.map((spawn) => `${spawn.row},${spawn.col}`));
        const kind = pickSpawnKind(
          {
            bossWeight: session.bossWeight,
            distractorWeight: session.distractorWeight,
            workWeight: session.workWeight,
            spawnIntervalMs: session.spawnIntervalMs,
          },
          {
            remainingMs: Math.max(0, session.deadlineAt - t),
            bossesSpawned: bossesSpawnedRef.current,
            bossTarget: session.bossTarget,
            bossMinLifetimeMs: config.bossMinLifetimeMs,
            bossMaxLifetimeMs: config.bossMaxLifetimeMs,
          },
        );
        const lifetime = kind === 'boss'
          ? randomLifetimeMs(config.bossMinLifetimeMs, config.bossMaxLifetimeMs)
          : randomLifetimeMs(config.bossMinLifetimeMs, Math.min(config.bossMaxLifetimeMs + 400, 2400));
        const next = createSpawn(kind, session.rows, session.cols, occupied, t, lifetime);
        if (!next) return alive;
        if (kind === 'boss') {
          bossesSpawnedRef.current += 1;
        }
        return [...alive, next];
      });
    };

    const timer = window.setInterval(tick, session.spawnIntervalMs);
    tick();
    return () => window.clearInterval(timer);
  }, [config, ended, session]);

  // 过期清理（老板未打自动消失）
  useEffect(() => {
    if (!isActiveGame) return undefined;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setSpawns((prev) => prev.filter((spawn) => spawn.expiresAt > t));
    }, 120);
    return () => window.clearInterval(timer);
  }, [isActiveGame]);

  const demoBoard = useMemo(() => {
    if (!previewDifficulty) return [];
    return buildNumberBoard(previewDifficulty.rows, previewDifficulty.cols, 42);
  }, [previewDifficulty]);

  const displayBoard = isActiveGame || session?.status === 'playing' ? board : demoBoard;
  const dataColCount = isActiveGame
    ? (session?.cols ?? previewDifficulty?.cols ?? 8)
    : (previewDifficulty?.cols ?? 8);
  const rows = isActiveGame
    ? (session?.rows ?? previewDifficulty?.rows ?? 8)
    : (previewDifficulty?.rows ?? 8);
  const filler = useCellFiller(wrapRef, rows, dataColCount, 72);
  const cols = useMemo(
    () => Array.from({ length: dataColCount + filler.cols }, (_, index) => COL_LABELS[index] ?? `C${index + 1}`),
    [dataColCount, filler.cols],
  );

  const spawnMap = useMemo(
    () => new Map(spawns.map((spawn) => [`${spawn.row},${spawn.col}`, spawn])),
    [spawns],
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

  const handleExtend = async () => {
    if (!canExtend) return;
    const next = await onExtend();
    if (next) {
      setNotice(`已延长 ${config?.extendSec ?? 15} 秒`);
      setNow(Date.now());
    }
  };

  const handleSpawnClick = (spawn: HitBossSpawn) => {
    if (!session || session.status !== 'playing' || settling || endedRef.current) return;

    setSpawns((prev) => prev.filter((item) => item.id !== spawn.id));

    if (spawn.kind === 'work') {
      void finishGame('lost', '打到打工，游戏结束');
      return;
    }

    if (spawn.kind === 'boss') {
      const nextHit = bossesHitRef.current + 1;
      bossesHitRef.current = nextHit;
      setBossesHit(nextHit);
      if (nextHit >= session.bossTarget) {
        void finishGame('won', '挑战成功！', nextHit, missHitsRef.current);
      }
      return;
    }

    if (isMissKind(spawn.kind)) {
      const nextMiss = missHitsRef.current + 1;
      missHitsRef.current = nextMiss;
      setMissHits(nextMiss);
      if (nextMiss > maxMissHits) {
        void finishGame('lost', `非老板超过 ${maxMissHits} 个，游戏结束`, bossesHitRef.current, nextMiss);
      } else {
        setNotice(`失误 ${nextMiss}/${maxMissHits}`);
      }
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
                {item.name} · {item.entryFee} 金币
              </option>
            ))}
          </select>
        </label>
        {difficulty ? (
          <span className={styles.llkMeta}>
            目标{difficulty.bossTarget}老板 · 奖励{difficulty.rewardCoins}金币
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
            title={`消耗 ${extendFee} 金币延长 ${config?.extendSec ?? 15} 秒（剩余 ${Math.max(0, (session?.maxExtends ?? 0) - (session?.extendCount ?? 0))} 次）`}
          >
            {extending
              ? '延长中'
              : `延长器 · ${extendFee}金币（${Math.max(0, session.maxExtends - session.extendCount)}）`}
          </button>
        ) : null}
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
            剩余 {formatHitBossTime(remainingMs)}
            {' · '}
            老板 {bossesHit}/{session.bossTarget}
            {' · '}
            失误 {missHits}/{maxMissHits}
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
              className={`${styles.colHeader} ${styles.hbColHeader}${index >= dataColCount ? ` ${styles.llkFillerColHeader}` : ''}`}
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
                const number = !isFillerCol ? displayBoard[rowIndex]?.[colIndex] : undefined;
                const spawn = !isFillerCol ? spawnMap.get(`${rowIndex},${colIndex}`) : undefined;
                const playable = Boolean(isActiveGame && spawn && !isFillerCol);
                return (
                  <button
                    key={ref}
                    type="button"
                    className={`${styles.cell} ${styles.llkCell} ${styles.hbCell} ${isFillerCol ? `${styles.llkFillerCell} ${styles.hbFillerCell}` : ''} ${!isActiveGame ? styles.llkDemoCell : ''} ${ref === selectedCell ? styles.selected : ''}`}
                    onClick={() => {
                      onSelectCell(ref);
                      if (playable && spawn) handleSpawnClick(spawn);
                    }}
                    disabled={isFillerCol}
                    title={spawn ? HIT_BOSS_LABELS[spawn.kind] : undefined}
                  >
                    {spawn ? (
                      displayMode === 'icon'
                        ? <span className={styles.llkEmoji}>{HIT_BOSS_ICONS[spawn.kind]}</span>
                        : <span className={styles.hbSpawnText}>{HIT_BOSS_LABELS[spawn.kind]}</span>
                    ) : (
                      <span className={styles.hbNumber}>{number ?? ''}</span>
                    )}
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
                  <div key={`${col}${rowNum}`} className={`${styles.fillerCell} ${styles.llkFillerCell} ${styles.hbFillerCell}`} />
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
              <h3 className={styles.csModalTitle}>打老板 · 玩法说明</h3>
              <button
                type="button"
                className={styles.csModalCloseIcon}
                aria-label="关闭"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.csModalBody} dangerouslySetInnerHTML={{ __html: HIT_BOSS_RULES_HTML }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
