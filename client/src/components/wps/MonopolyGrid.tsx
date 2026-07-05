import type { MonopolyBoardCell, MonopolyPlayerState, Room } from '@tk/shared';
import styles from './SpreadsheetGrid.module.css';

interface MonopolyGridProps {
  room: Room;
  playerId: string | null;
  selectedCell: string;
  onSelectCell: (ref: string) => void;
  onRoll: () => void;
  onBuy: () => void;
  onSkip: () => void;
  onViewProfile?: (player: import('@tk/shared').RoomPlayer) => void;
}

const BOARD_COLUMNS = ['A', 'B', 'C', 'D'];
const PLAYER_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'];

function cellTypeLabel(type: MonopolyBoardCell['type']) {
  if (type === 'start') return '起点';
  if (type === 'city') return '城市';
  if (type === 'tax') return '税务';
  if (type === 'chance') return '机会';
  return '休整';
}

function propertyNames(player: MonopolyPlayerState, board: MonopolyBoardCell[]) {
  return player.properties
    .map((index) => board.find((cell) => cell.index === index)?.name)
    .filter(Boolean)
    .join('、') || '-';
}

export function MonopolyGrid({
  room,
  playerId,
  selectedCell,
  onSelectCell,
  onRoll,
  onBuy,
  onSkip,
  onViewProfile,
}: MonopolyGridProps) {
  const state = room.monopoly;
  if (!state) {
    return <div className={styles.emptyPanelLine}>大富翁对局尚未初始化</div>;
  }

  const current = state.players[state.turnIndex];
  const isMyTurn = current?.playerId === playerId;
  const currentCell = current ? state.board[current.position] : null;
  const canBuy = isMyTurn && state.pendingAction === 'buy_or_skip' && currentCell?.type === 'city' && !currentCell.ownerId;
  const canRoll = isMyTurn && !state.pendingAction && room.status === 'playing';
  const diceText = state.lastDice ? `${state.lastDice[0]} + ${state.lastDice[1]}` : '-';

  return (
    <div className={styles.monopolyWrap}>
      <div className={styles.monopolyToolbar}>
        <span>回合 {state.round}</span>
        <span>当前：{current?.nickname ?? '-'}</span>
        <span>骰子：{diceText}</span>
        <button type="button" onClick={onRoll} disabled={!canRoll}>掷骰</button>
        <button type="button" onClick={onBuy} disabled={!canBuy}>购买</button>
        <button type="button" onClick={onSkip} disabled={!isMyTurn || !state.pendingAction}>跳过</button>
      </div>
      <div className={styles.monopolyBody}>
        <div className={styles.monopolyBoard}>
          <div className={styles.corner} />
          <div className={styles.colHeaders}>
            {BOARD_COLUMNS.map((col) => (
              <div key={col} className={styles.colHeader}>{col}</div>
            ))}
          </div>
          {state.board.map((cell, index) => {
            const rowNum = index + 1;
            const playersHere = state.players.filter((player) => player.position === cell.index);
            const owner = state.players.find((player) => player.playerId === cell.ownerId);
            return (
              <div key={cell.index} className={styles.row}>
                <div className={styles.rowHeader}>{rowNum}</div>
                {[cell.name, cell.country, cellTypeLabel(cell.type), owner?.nickname ?? (cell.price ? `${cell.price}/${cell.rent}` : '-')].map((value, ci) => {
                  const ref = `${BOARD_COLUMNS[ci]}${rowNum}`;
                  const hasPlayer = ci === 0 && playersHere.length > 0;
                  return (
                    <button
                      key={ref}
                      type="button"
                      className={`${styles.cell} ${styles.monopolyCell} ${ref === selectedCell ? styles.selected : ''} ${hasPlayer ? styles.turnRowCell : ''}`}
                      onClick={() => onSelectCell(ref)}
                      title={playersHere.map((player) => player.nickname).join('、') || undefined}
                    >
                      {value}
                      {hasPlayer ? <span className={styles.monopolyToken}>{playersHere.map((player) => player.nickname.slice(0, 1)).join('')}</span> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={styles.monopolySide}>
          <div className={styles.sidePanelTitle}>玩家资产</div>
          <div className={styles.monopolyTable}>
            <div className={styles.row}>
              <div className={styles.rowHeader}>1</div>
              {['玩家', '现金', '位置', '资产', '状态', '资料'].map((header, index) => (
                <div key={header} className={`${styles.cell} ${styles.headerCell}`} style={{ minWidth: index === 3 ? 160 : 72, width: index === 3 ? 160 : 72 }}>{header}</div>
              ))}
            </div>
            {state.players.map((player, index) => {
              const roomPlayer = room.players.find((item) => item.id === player.playerId);
              const rowNum = index + 2;
              return (
                <div key={player.playerId} className={`${styles.row}${player.playerId === current?.playerId ? ` ${styles.turnRow}` : ''}`}>
                  <div className={styles.rowHeader}>{rowNum}</div>
                  {[player.nickname, String(player.cash), state.board[player.position]?.name ?? '-', propertyNames(player, state.board), player.bankrupt ? '破产' : '正常'].map((value, ci) => (
                    <div key={`${PLAYER_COLUMNS[ci]}${rowNum}`} className={styles.cell} style={{ minWidth: ci === 3 ? 160 : 72, width: ci === 3 ? 160 : 72 }}>{value}</div>
                  ))}
                  <button
                    type="button"
                    className={`${styles.cell} ${styles.linkCell}`}
                    style={{ minWidth: 72, width: 72 }}
                    onClick={() => roomPlayer && onViewProfile?.(roomPlayer)}
                  >
                    查看
                  </button>
                </div>
              );
            })}
          </div>
          <div className={styles.sidePanelTitle}>日志</div>
          <div className={styles.logScroll}>
            {state.log.length > 0 ? state.log.map((line, index) => (
              <div key={`${line}-${index}`} className={styles.logLine}>{line}</div>
            )) : <div className={styles.emptyPanelLine}>暂无日志</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
