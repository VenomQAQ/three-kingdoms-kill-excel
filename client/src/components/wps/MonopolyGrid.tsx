import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, MonopolyBoardCell, MonopolyPlayerState, Room } from '@tk/shared';
import {
  getCityNextLevelRent,
  getCellTemplate,
  resolveCellRent,
  resolveCellUpgradeCost,
} from '@tk/shared';
import { DECOY_HEADERS, DECOY_ROWS } from '../../data/decoy';
import { formatChatTime } from '../../utils/chatTime';
import {
  buildMonopolyPlayerAssetsView,
  MonopolyPlayerAssetsModal,
  type MonopolyPlayerAssetsView,
} from './MonopolyPlayerAssetsModal';
import styles from './SpreadsheetGrid.module.css';

interface MonopolyGridProps {
  room: Room;
  chatMessages: ChatMessage[];
  playerId: string | null;
  selectedCell: string;
  showCellColors?: boolean;
  onShowCellColorsChange?: (enabled: boolean) => void;
  onSelectCell: (ref: string) => void;
  onRoll: () => void;
  onBuy: () => void;
  onUpgrade: () => void;
  onSkip: () => void;
  onViewChatProfile?: (message: ChatMessage) => void;
  onSendChat: (content: string) => void;
}

const BOARD_SIZE = 11;
const FILLER_ROW_COUNT = BOARD_SIZE + 1;
const FILLER_COL_MIN_WIDTH = 72;

function spreadsheetColumnLabel(index: number): string {
  let label = '';
  let current = index;
  while (current >= 0) {
    label = String.fromCharCode('A'.charCodeAt(0) + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  }
  return label;
}
const CORNER_LABELS = new Map<number, string>([
  [0, '起点'],
  [10, '进牢'],
  [20, '罚款停车'],
  [30, '机场'],
]);
const BOARD_COLUMNS = Array.from({ length: BOARD_SIZE }, (_, index) =>
  String.fromCharCode('A'.charCodeAt(0) + index),
);

function cellTypeLabel(type: MonopolyBoardCell['type']) {
  switch (type) {
    case 'start':
      return '起点';
    case 'city':
      return '地块';
    case 'tax':
      return '税务';
    case 'chance':
      return '机会';
    case 'fate':
      return '命运';
    case 'rail':
      return '交通';
    case 'utility':
      return '公用';
    case 'bonus':
      return '奖励';
    case 'jail':
      return '监牢';
    default:
      return '事件';
  }
}

function ringPosition(index: number): { x: number; y: number } {
  const edge = BOARD_SIZE - 1;
  const normalized = index % (BOARD_SIZE * 4 - 4);
  if (normalized <= edge) return { x: normalized, y: edge };
  if (normalized <= edge * 2) return { x: edge, y: edge - (normalized - edge) };
  if (normalized <= edge * 3) return { x: edge - (normalized - edge * 2), y: 0 };
  return { x: 0, y: normalized - edge * 3 };
}

function currentRent(cell: MonopolyBoardCell, board: MonopolyBoardCell[]): number {
  return resolveCellRent(cell, { board, ownerId: cell.ownerId });
}

function nextUpgradeCost(cell: MonopolyBoardCell): number | null {
  return resolveCellUpgradeCost(cell);
}

function nextLevelRent(cell: MonopolyBoardCell): number | null {
  const template = getCellTemplate(cell);
  if (!template || template.kind !== 'city') return null;
  return getCityNextLevelRent(template, cell.level ?? 1);
}

function cellSummary(cell: MonopolyBoardCell, board: MonopolyBoardCell[], owner?: MonopolyPlayerState): string {
  if (owner) return `Lv.${cell.level ?? 1} ${owner.nickname} 租金${currentRent(cell, board)}`;
  if (cell.type === 'city') return `价格 ${cell.displayPrice ?? cell.price}`;
  if (cell.type === 'rail' || cell.type === 'utility') return `价格 ${cell.displayPrice ?? cell.price} 租${cell.rent}`;
  if (cell.type === 'tax') return `扣 ${cell.rent}`;
  if (cell.type === 'start') return `奖励 ${cell.displayPrice ?? cell.price ?? 0}`;
  return cellTypeLabel(cell.type);
}

function cornerSlotIndex(x: number, y: number): number | null {
  const edge = BOARD_SIZE - 1;
  if (x === 0 && y === edge) return 0;
  if (x === edge && y === edge) return 10;
  if (x === edge && y === 0) return 20;
  if (x === 0 && y === 0) return 30;
  return null;
}

function shortName(name: string) {
  return Array.from(name).slice(0, 5).join('');
}

function playerTags(players: MonopolyPlayerState[], selfId: string | null): string[] {
  return players
    .filter((player) => player.playerId !== selfId)
    .map((player) => shortName(player.nickname));
}

function centerCellValue(cx: number, cy: number): string {
  if (cy === 0) {
    if (cx === 0) return '区域销售作战图';
    return DECOY_HEADERS[cx - 1] ?? '';
  }
  return DECOY_ROWS[cy - 1]?.[cx] ?? '';
}

function boardAccent(cell: MonopolyBoardCell): string | undefined {
  if (cell.type === 'city' && cell.colorGroup) {
    const palette: Record<string, string> = {
      green: '#2e8b57',
      gray: '#7f8c8d',
      blue: '#3d6ccf',
      red: '#e74c3c',
      yellow: '#e6b800',
      purple: '#8e44ad',
      pink: '#d63384',
    };
    return palette[cell.colorGroup];
  }
  if (cell.type === 'tax') return '#f5a623';
  if (cell.type === 'chance') return '#f1c40f';
  if (cell.type === 'fate') return '#ff7eb6';
  if (cell.type === 'rail') return '#2f80ed';
  if (cell.type === 'utility') return '#27ae60';
  if (cell.type === 'bonus') return '#ff9f43';
  if (cell.type === 'jail') return '#34495e';
  return undefined;
}

export function MonopolyGrid({
  room,
  chatMessages,
  playerId,
  selectedCell,
  showCellColors = false,
  onShowCellColorsChange,
  onSelectCell,
  onRoll,
  onBuy,
  onUpgrade,
  onSkip,
  onViewChatProfile,
  onSendChat,
}: MonopolyGridProps) {
  const [chatInput, setChatInput] = useState('');
  const [confirmAction, setConfirmAction] = useState<'buy' | 'upgrade' | null>(null);
  const [assetsView, setAssetsView] = useState<MonopolyPlayerAssetsView | null>(null);
  const [fillerCols, setFillerCols] = useState(6);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fillerRef = useRef<HTMLDivElement>(null);
  const state = room.monopoly;

  useEffect(() => {
    const el = fillerRef.current;
    if (!el) return;
    const updateCols = () => {
      const next = Math.max(1, Math.floor(el.clientWidth / FILLER_COL_MIN_WIDTH));
      setFillerCols((prev) => (prev === next ? prev : next));
    };
    updateCols();
    const observer = new ResizeObserver(updateCols);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [state?.log]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    setConfirmAction(null);
  }, [state?.turnIndex, state?.pendingAction]);

  if (!state) {
    return <div className={styles.emptyPanelLine}>大富翁对局尚未初始化</div>;
  }

  const current = state.players[state.turnIndex];
  const isMyTurn = current?.playerId === playerId;
  const currentCell = current ? state.board[current.position] : null;
  const canBuy = isMyTurn && state.pendingAction === 'buy_or_skip' && currentCell && !currentCell.ownerId
    && (currentCell.type === 'city' || currentCell.type === 'rail' || currentCell.type === 'utility');
  const canUpgrade = isMyTurn && state.pendingAction === 'upgrade_or_skip' && currentCell?.type === 'city' && currentCell.ownerId === playerId;
  const canRoll = isMyTurn && !state.pendingAction && room.status === 'playing';
  const upgradeCost = currentCell ? nextUpgradeCost(currentCell) : null;
  const upgradedRent = currentCell ? nextLevelRent(currentCell) : null;

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatInput('');
  };

  const confirmTitle = confirmAction === 'upgrade' ? '升级地块' : '购买地块';
  const confirmCost = confirmAction === 'upgrade' ? upgradeCost : currentCell?.price;

  const openAssets = (player: MonopolyPlayerState) => {
    const roomPlayer = room.players.find((item) => item.id === player.playerId);
    setAssetsView(buildMonopolyPlayerAssetsView(player, state.board, roomPlayer?.connected ?? false));
  };

  return (
    <div className={styles.monopolyWrap}>
      <div className={styles.monopolyToolbar}>
        <span>回合 {state.round}</span>
        {onShowCellColorsChange ? (
          <button
            type="button"
            className={styles.monopolyToolbarToggle}
            onClick={() => onShowCellColorsChange(!showCellColors)}
          >
            {showCellColors ? '隐藏地块颜色' : '显示地块颜色'}
          </button>
        ) : null}
        <div className={styles.monopolyToolbarActions}>
          <button type="button" onClick={onRoll} disabled={!canRoll}>掷骰</button>
          <button type="button" onClick={() => setConfirmAction('buy')} disabled={!canBuy}>购买</button>
          <button type="button" onClick={() => setConfirmAction('upgrade')} disabled={!canUpgrade}>升级</button>
          <button type="button" onClick={onSkip} disabled={!isMyTurn || !state.pendingAction}>跳过</button>
        </div>
      </div>
      <div className={styles.monopolyBody}>
        <div className={styles.monopolyMain}>
          <div className={styles.monopolyBoard}>
          <div className={styles.corner} />
          {BOARD_COLUMNS.map((col, index) => (
            <div key={col} className={styles.colHeader} style={{ gridColumn: index + 2, gridRow: 1 }}>{col}</div>
          ))}
          {Array.from({ length: BOARD_SIZE }, (_, index) => (
            <div key={index} className={styles.rowHeader} style={{ gridColumn: 1, gridRow: index + 2 }}>{index + 1}</div>
          ))}
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, gridIndex) => {
            const x = gridIndex % BOARD_SIZE;
            const y = Math.floor(gridIndex / BOARD_SIZE);
            const ref = `${BOARD_COLUMNS[x]}${y + 1}`;
            const isCenter = x > 0 && x < BOARD_SIZE - 1 && y > 0 && y < BOARD_SIZE - 1;
            if (!isCenter) {
              const cornerIndex = cornerSlotIndex(x, y);
              if (cornerIndex == null) return null;
              return (
                <button
                  key={ref}
                  type="button"
                  className={`${styles.cell} ${styles.monopolyCornerCell} ${ref === selectedCell ? styles.selected : ''}`}
                  style={{ gridColumn: x + 2, gridRow: y + 2 }}
                  onClick={() => onSelectCell(ref)}
                  aria-label={ref}
                >
                  <span className={styles.monopolyCornerName}>{CORNER_LABELS.get(cornerIndex)}</span>
                </button>
              );
            }
            const cx = x - 1;
            const cy = y - 1;
            const value = centerCellValue(cx, cy);
            return (
              <button
                key={ref}
                type="button"
                className={`${styles.cell} ${styles.monopolyCenterCell} ${ref === selectedCell ? styles.selected : ''}`}
                style={{ gridColumn: x + 2, gridRow: y + 2 }}
                onClick={() => onSelectCell(ref)}
                aria-label={ref}
                title={value || ref}
              >
                {value}
              </button>
            );
          })}
          {state.board.map((cell) => {
            const pos = ringPosition(cell.index);
            const ref = `${BOARD_COLUMNS[pos.x]}${pos.y + 1}`;
            const playersHere = state.players.filter((player) => player.position === cell.index);
            const hasMeHere = playersHere.some((player) => player.playerId === playerId);
            const otherTags = playerTags(playersHere, playerId);
            const owner = state.players.find((player) => player.playerId === cell.ownerId);
            return (
              <button
                key={cell.index}
                type="button"
                className={`${styles.cell} ${styles.monopolyCell} ${ref === selectedCell ? styles.selected : ''} ${hasMeHere ? styles.monopolyMyCell : ''} ${otherTags.length > 0 ? styles.turnRowCell : ''}`}
                style={{ gridColumn: pos.x + 2, gridRow: pos.y + 2 }}
                onClick={() => onSelectCell(ref)}
                title={`${cell.name} | ${cellTypeLabel(cell.type)} | ${cellSummary(cell, state.board, owner)}`}
              >
                {showCellColors && boardAccent(cell) ? (
                  <span className={styles.monopolyCellBand} style={{ backgroundColor: boardAccent(cell) }} aria-hidden="true" />
                ) : null}
                {otherTags.length > 0 ? (
                  <span className={styles.monopolyTokenGroup}>
                    {otherTags.map((tag, tagIndex) => (
                      <span key={`${cell.index}-${tagIndex}-${tag}`} className={styles.monopolyToken}>{tag}</span>
                    ))}
                  </span>
                ) : null}
                <span className={styles.monopolyCellName}>{cell.name}</span>
                <span className={styles.monopolyCellMeta}>{cellSummary(cell, state.board, owner)}</span>
              </button>
            );
          })}
          </div>
          <div
            className={styles.monopolyFiller}
            ref={fillerRef}
            style={{ gridTemplateColumns: `repeat(${fillerCols}, minmax(72px, 1fr))` }}
          >
            {Array.from({ length: fillerCols * FILLER_ROW_COUNT }, (_, index) => {
              const rowIndex = Math.floor(index / fillerCols);
              const colIndex = index % fillerCols;
              const colLabel = spreadsheetColumnLabel(BOARD_SIZE + colIndex);
              const ref = `${colLabel}${rowIndex + 1}`;
              const isHeader = rowIndex === 0;
              return (
                <button
                  key={ref}
                  type="button"
                  className={`${styles.monopolyFillerCell} ${ref === selectedCell ? styles.selected : ''} ${isHeader ? styles.headerCell : ''}`}
                  onClick={() => onSelectCell(ref)}
                  aria-label={ref}
                >
                  {isHeader ? colLabel : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.monopolySide}>
          <div className={styles.sidePanelTitle}>玩家资产</div>
          <div className={styles.monopolyTable}>
            <div className={`${styles.row} ${styles.monopolyAssetRow}`}>
              <div className={styles.rowHeader}>1</div>
              <div className={`${styles.cell} ${styles.headerCell} ${styles.monopolyAssetPlayerCol}`}>玩家</div>
              <div className={`${styles.cell} ${styles.headerCell} ${styles.monopolyAssetCashCol}`}>现金</div>
              <div className={`${styles.cell} ${styles.headerCell} ${styles.monopolyAssetPositionCol}`}>位置</div>
            </div>
            {state.players.map((player, index) => {
              const roomPlayer = room.players.find((item) => item.id === player.playerId);
              const rowNum = index + 2;
              const connected = roomPlayer?.connected ?? false;
              return (
                <div key={player.playerId} className={`${styles.row} ${styles.monopolyAssetRow}${player.playerId === current?.playerId ? ` ${styles.turnRow}` : ''}`}>
                  <div className={styles.rowHeader}>{rowNum}</div>
                  <button
                    type="button"
                    className={`${styles.cell} ${styles.linkCell} ${styles.monopolyPlayerNameCell} ${styles.monopolyAssetPlayerCol}`}
                    onClick={() => openAssets(player)}
                    title="玩家资产详情"
                  >
                    <span
                      className={connected ? styles.monopolyOnlineDot : styles.monopolyOfflineDot}
                      aria-hidden="true"
                    />
                    {player.nickname}
                  </button>
                  <div className={`${styles.cell} ${styles.monopolyAssetCashCol}`}>{player.cash}</div>
                  <div className={`${styles.cell} ${styles.monopolyAssetPositionCol}`}>{state.board[player.position]?.name ?? '-'}</div>
                </div>
              );
            })}
          </div>
          <section className={styles.monopolyLogPanel}>
            <div className={styles.sidePanelTitle}>日志</div>
            <div className={styles.logScroll} ref={logScrollRef}>
              {state.log.length > 0 ? state.log.map((line, index) => (
                <div key={`${line}-${index}`} className={styles.logLine}>{line}</div>
              )) : <div className={styles.emptyPanelLine}>暂无日志</div>}
            </div>
          </section>
          <section className={styles.monopolyChatPanel}>
            <div className={styles.sidePanelTitle}>聊天区</div>
            <div className={styles.logScroll} ref={chatScrollRef}>
              {chatMessages.length === 0 ? (
                <div className={styles.emptyPanelLine}>暂无聊天消息</div>
              ) : (
                chatMessages.map((message) => (
                  <div key={message.id} className={styles.chatLine}>
                    <button type="button" className={styles.chatNameBtn} onClick={() => onViewChatProfile?.(message)} title="查看玩家资料">
                      {message.nickname}
                    </button>
                    <span className={styles.chatTime}>{formatChatTime(message.timestamp)}</span>
                    <span>{message.content}</span>
                  </div>
                ))
              )}
            </div>
            <div className={styles.chatInputArea}>
              <input
                className={styles.chatInput}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handleChatSubmit();
                  }
                }}
                placeholder="输入消息，Enter 发送..."
                maxLength={200}
              />
              <button type="button" className={styles.chatSendBtn} onClick={handleChatSubmit} disabled={!chatInput.trim()}>
                发送
              </button>
            </div>
          </section>
        </div>
      </div>
      {confirmAction && current && currentCell ? (
        <div className={styles.monopolyDialogOverlay} role="dialog" aria-modal="true" aria-label={confirmTitle}>
          <div className={styles.monopolyDialog}>
            <div className={styles.monopolyDialogTitle}>{confirmTitle}</div>
            <div className={styles.monopolyDialogBody}>
              <div>地块：{currentCell.name}</div>
              <div>你的余额：{current.cash}</div>
              <div>需要花费：{confirmCost ?? '-'}</div>
              {confirmAction === 'upgrade' ? (
                <div>升级后过路费：{upgradedRent ?? '-'}</div>
              ) : null}
            </div>
            <div className={styles.monopolyDialogActions}>
              <button type="button" onClick={() => setConfirmAction(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction === 'buy') onBuy();
                  else onUpgrade();
                  setConfirmAction(null);
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <MonopolyPlayerAssetsModal view={assetsView} board={state.board} onClose={() => setAssetsView(null)} />
    </div>
  );
}
