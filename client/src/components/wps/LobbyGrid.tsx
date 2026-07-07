import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { Room, RoomPlayer } from '@tk/shared';
import type { GameType } from '@tk/shared';
import styles from './SpreadsheetGrid.module.css';
import { COL_LABELS } from '../../data/decoy';
import { useCellFiller } from '../../utils/useCellFiller';
import { formatPlayerName } from '../../utils/display';

interface LobbyGridProps {
  room: Room;
  playerId: string | null;
  selectedCell: string;
  onSelectCell: (ref: string) => void;
  isSandbox?: boolean;
  onToggleReady?: () => void;
  onViewProfile?: (player: RoomPlayer) => void;
  onSwitchGame?: (gameType?: GameType) => void;
  bgColorToken?: string;
}

const SANDBOX_HEADERS = ['座位', '昵称', '武将', '类型', '准备', '连接', '备注'];
const ROOM_HEADERS = ['席位', '昵称', '状态', '连接', '身份', '房间信息'];
const SANDBOX_COL_WIDTHS = [48, 144, 88, 64, 72, 64, 120];
const ROOM_COL_WIDTHS = [56, 176, 88, 72, 88, 184];
const FIXED_ROWS = 3;

function gameName(gameType?: GameType): string {
  return gameType === 'monopoly' ? '世界版大富翁' : '三国杀标准版';
}

function statusLabel(status: Room['status']): string {
  if (status === 'selecting') return '选将中';
  if (status === 'playing') return '游戏中';
  if (status === 'finished') return '已结束';
  return '等待中';
}

export function LobbyGrid({
  room,
  playerId,
  selectedCell,
  onSelectCell,
  isSandbox = false,
  onToggleReady,
  onViewProfile,
  onSwitchGame,
  bgColorToken = '#ffffff',
}: LobbyGridProps) {
  const headers = isSandbox ? SANDBOX_HEADERS : ROOM_HEADERS;
  const colWidths = isSandbox ? SANDBOX_COL_WIDTHS : ROOM_COL_WIDTHS;
  const cols = COL_LABELS.slice(0, headers.length);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dataRowCount = FIXED_ROWS + room.players.length;
  const isHost = room.hostId === playerId;

  const filler = useCellFiller(wrapRef, dataRowCount);
  const totalRows = dataRowCount + filler.rows;

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      data-bg-cell={bgColorToken}
      style={{ '--bg-cell': bgColorToken } as CSSProperties}
    >
      <div className={styles.corner} />
      <div className={styles.colHeaders}>
        {cols.map((c, i) => (
          <div
            key={c}
            className={styles.colHeader}
            style={{ minWidth: colWidths[i], width: colWidths[i] }}
          >
            {c}
          </div>
        ))}
        <div className={styles.colHeaderFlex} />
      </div>
      <div className={styles.bodyFit}>
        {Array.from({ length: totalRows }, (_, ri) => {
          const rowNum = ri + 1;
          const isFiller = ri >= dataRowCount;
          const isLastRow = ri === totalRows - 1;

          return (
            <div
              key={rowNum}
              className={`${styles.row}${isFiller ? ` ${styles.fillerRow}` : ''}${
                isFiller && isLastRow ? ` ${styles.fillerRowStretch}` : ''
              }`}
            >
              <div className={styles.rowHeader}>{rowNum}</div>
              {cols.map((col, ci) => {
                const ref = `${col}${rowNum}`;
                let value = '';
                let extra = '';
                const pIdx = rowNum - 4;
                const rowPlayer =
                  pIdx >= 0 && pIdx < room.players.length ? room.players[pIdx] : null;

                if (rowNum === 1) {
                  value = headers[ci];
                  extra = styles.headerCell;
                } else if (rowNum === 2) {
                  if (ci === 0) {
                    value = '房间号';
                    extra = styles.headerCell;
                  } else if (ci === 1) {
                    value = room.code;
                  } else if (ci === 2) {
                    value = '当前游戏';
                    extra = styles.headerCell;
                  } else if (ci === 3) {
                    value = gameName(room.gameType);
                    if (!isSandbox && isHost && room.status === 'waiting') extra = styles.linkCell;
                  } else if (ci === 4) {
                    value = statusLabel(room.status);
                    extra = room.status === 'waiting' ? styles.waiting : styles.playing;
                  } else if (ci === 5) {
                    value = `${room.players.length}/${room.maxPlayers} 人`;
                  }
                } else if (rowNum === 3 && ci === 1) {
                  value = isSandbox
                    ? '等待开局 - 请添加角色后点击「模拟开局」'
                    : '等待开局 - 全员准备后房主点击「开始」';
                } else if (rowPlayer) {
                  if (rowPlayer.id === playerId) extra = styles.myRow;
                  if (isSandbox) {
                    switch (ci) {
                      case 0:
                        value = String(rowPlayer.seat ?? pIdx + 1);
                        break;
                      case 1:
                        value = formatPlayerName(rowPlayer, rowPlayer.id === room.hostId);
                        extra += ` ${styles.linkCell}`;
                        break;
                      case 2:
                        value = rowPlayer.general ?? '-';
                        break;
                      case 3:
                        value = rowPlayer.isVirtual ? '虚拟' : '真人';
                        break;
                      case 4:
                        value = rowPlayer.ready ? '已准备' : '未准备';
                        extra += rowPlayer.ready ? ` ${styles.ready}` : '';
                        break;
                      case 5:
                        value = rowPlayer.connected ? '在线' : '离线';
                        break;
                      case 6:
                        value = rowPlayer.id === room.hostId ? '房主' : '';
                        break;
                      default:
                        break;
                    }
                  } else {
                    switch (ci) {
                      case 0:
                        value = String(rowPlayer.seat ?? pIdx + 1);
                        break;
                      case 1:
                        value = formatPlayerName(rowPlayer, rowPlayer.id === room.hostId);
                        extra += ` ${styles.linkCell}`;
                        break;
                      case 2:
                        value = rowPlayer.ready ? '已准备' : '未准备';
                        extra += rowPlayer.ready ? ` ${styles.ready}` : '';
                        break;
                      case 3:
                        value = rowPlayer.connected ? '在线' : '离线';
                        break;
                      case 4:
                        value = rowPlayer.id === room.hostId ? '房主' : '成员';
                        break;
                      case 5:
                        value = rowPlayer.id === playerId ? '我' : '';
                        break;
                      default:
                        break;
                    }
                  }
                }

                const isMyReadyCell =
                  !isSandbox &&
                  !!onToggleReady &&
                  !!rowPlayer &&
                  ci === 2 &&
                  rowPlayer.id === playerId;
                const isGameSwitchCell =
                  !isSandbox && rowNum === 2 && ci === 3 && isHost && room.status === 'waiting';

                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${ref === selectedCell ? styles.selected : ''} ${extra}${
                      isMyReadyCell || isGameSwitchCell ? ` ${styles.linkCell}` : ''
                    }`}
                    style={{
                      minWidth: colWidths[ci],
                      width: colWidths[ci],
                    }}
                    title={
                      isMyReadyCell
                        ? '点击切换准备状态'
                        : isGameSwitchCell
                          ? '点击切换当前游戏'
                          : undefined
                    }
                    onClick={() => {
                      onSelectCell(ref);
                      if (isMyReadyCell) onToggleReady();
                      if (isGameSwitchCell) onSwitchGame?.();
                      if (ci === 1 && rowPlayer) onViewProfile?.(rowPlayer);
                    }}
                  >
                    {value}
                  </div>
                );
              })}
              <div className={styles.fillerCellFlex} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
