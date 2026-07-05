import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { Room } from '@tk/shared';
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
  bgColorToken?: string;
}

const HEADERS = ['座位', '昵称', '武将', '类型', '准备', '连接', '备注'];
const COL_WIDTHS = [48, 100, 88, 64, 72, 64, 120];
/** 表头 + 房间信息 2 行 */
const FIXED_ROWS = 3;

export function LobbyGrid({
  room,
  playerId,
  selectedCell,
  onSelectCell,
  isSandbox = false,
  onToggleReady,
  bgColorToken = '#ffffff',
}: LobbyGridProps) {
  const cols = COL_LABELS.slice(0, HEADERS.length);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dataRowCount = FIXED_ROWS + room.players.length;

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
            style={{ minWidth: COL_WIDTHS[i], width: COL_WIDTHS[i] }}
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
                  value = HEADERS[ci];
                  extra = styles.headerCell;
                } else if (rowNum === 2 && ci === 1) {
                  value = `房间号：${room.code}`;
                } else if (rowNum === 2 && ci === 4) {
                  value = room.status === 'waiting' ? '等待中' : '—';
                  extra = styles.waiting;
                } else if (rowNum === 2 && ci === 5) {
                  value = `${room.players.length}/${room.maxPlayers} 人`;
                } else if (rowNum === 3 && ci === 1) {
                  value = isSandbox
                    ? '等待开局 — 请添加角色后点击「模拟开局」'
                    : '等待开局 — 全员准备后房主点击「开始」';
                } else {
                  if (rowPlayer) {
                    if (rowPlayer.id === playerId) extra = styles.myRow;
                    switch (ci) {
                      case 0:
                        value = String(rowPlayer.seat ?? pIdx + 1);
                        break;
                      case 1:
                        value = formatPlayerName(rowPlayer, rowPlayer.id === room.hostId);
                        break;
                      case 2:
                        value = rowPlayer.general ?? '—';
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
                  }
                }

                const isMyReadyCell =
                  !isSandbox &&
                  !!onToggleReady &&
                  !!rowPlayer &&
                  ci === 4 &&
                  rowPlayer.id === playerId;

                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${ref === selectedCell ? styles.selected : ''} ${extra}${
                      isMyReadyCell ? ` ${styles.linkCell}` : ''
                    }`}
                    style={{
                      minWidth: COL_WIDTHS[ci],
                      width: COL_WIDTHS[ci],
                    }}
                    title={isMyReadyCell ? '点击切换准备状态' : undefined}
                    onClick={() => {
                      onSelectCell(ref);
                      if (isMyReadyCell) onToggleReady();
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
