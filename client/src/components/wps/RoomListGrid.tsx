import { RoomListItem } from '@tk/shared';
import styles from './SpreadsheetGrid.module.css';
import { COL_LABELS } from '../../data/decoy';

const HEADERS = ['房间号', '状态', '玩家人数', '房主', '备注'];
const COL_WIDTHS = [100, 88, 88, 100, 120];

interface RoomListGridProps {
  rooms: RoomListItem[];
  selectedCell: string;
  onSelectCell: (ref: string) => void;
  onJoinRoom: (code: string) => void;
}

function statusLabel(status: RoomListItem['status']) {
  if (status === 'playing') return '游戏中';
  if (status === 'finished') return '已结束';
  return '等待中';
}

export function RoomListGrid({
  rooms,
  selectedCell,
  onSelectCell,
  onJoinRoom,
}: RoomListGridProps) {
  const cols = COL_LABELS.slice(0, HEADERS.length);
  const dataRows = rooms.length > 0 ? rooms : [];
  const emptyRows = Math.max(0, 12 - dataRows.length);
  const rowCount = 1 + dataRows.length + emptyRows;

  return (
    <div className={styles.wrap}>
      <div className={styles.corner} />
      <div className={styles.colHeaders} style={{ paddingLeft: 40 }}>
        {cols.map((c, i) => (
          <div
            key={c}
            className={styles.colHeader}
            style={{ minWidth: COL_WIDTHS[i], width: COL_WIDTHS[i] }}
          >
            {c}
          </div>
        ))}
      </div>
      <div className={styles.body}>
        {Array.from({ length: rowCount }, (_, ri) => {
          const rowNum = ri + 1;
          const room = ri > 0 && ri <= dataRows.length ? dataRows[ri - 1] : null;
          const isHeader = ri === 0;

          return (
            <div key={rowNum} className={styles.row}>
              <div className={styles.rowHeader}>{rowNum}</div>
              {cols.map((col, ci) => {
                const ref = `${col}${rowNum}`;
                let value = '';
                let extraClass = isHeader ? styles.headerCell : '';
                let onClick = () => onSelectCell(ref);

                if (isHeader) {
                  value = HEADERS[ci];
                } else if (room) {
                  switch (ci) {
                    case 0:
                      value = room.code;
                      break;
                    case 1:
                      value = statusLabel(room.status);
                      extraClass += room.status === 'playing' ? ` ${styles.playing}` : ` ${styles.waiting}`;
                      break;
                    case 2:
                      value = `${room.playerCount}/${room.maxPlayers}`;
                      break;
                    case 3:
                      value = room.hostNickname;
                      break;
                    case 4:
                      value = room.isSandbox ? '模拟测试房' : '';
                      break;
                    default:
                      break;
                  }
                  if (ci === 0) {
                    onClick = () => {
                      onSelectCell(ref);
                      onJoinRoom(room.code);
                    };
                  }
                }

                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${ref === selectedCell ? styles.selected : ''} ${extraClass}`}
                    style={{ minWidth: COL_WIDTHS[ci], width: COL_WIDTHS[ci] }}
                    onClick={onClick}
                    title={ci === 0 && room ? '双击或点击加入房间' : undefined}
                  >
                    {value}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
