import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { RoomListItem } from '@tk/shared';
import styles from './SpreadsheetGrid.module.css';
import { COL_LABELS } from '../../data/decoy';
import { useCellFiller } from '../../utils/useCellFiller';

const HEADERS = ['房间号', '状态', '玩家人数', '房主', '版本', '操作'];
const COL_WIDTHS = [100, 88, 88, 100, 132, 120];

interface RoomListGridProps {
  rooms: RoomListItem[];
  selectedCell: string;
  onSelectCell: (ref: string) => void;
  onJoinRoom: (code: string) => void;
  isGuest?: boolean;
  onGuestAction?: () => void;
  bgColorToken?: string;
}

function statusLabel(status: RoomListItem['status']) {
  if (status === 'playing') return '游戏中';
  if (status === 'selecting') return '选将中';
  if (status === 'finished') return '已结束';
  return '等待中';
}

export function RoomListGrid({
  rooms,
  selectedCell,
  onSelectCell,
  onJoinRoom,
  isGuest = false,
  onGuestAction,
  bgColorToken = '#ffffff',
}: RoomListGridProps) {
  const cols = COL_LABELS.slice(0, HEADERS.length);
  const dataRows = rooms;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const filler = useCellFiller(wrapRef, 1 + dataRows.length);
  const totalRows = 1 + dataRows.length + filler.rows;

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
          const room = ri > 0 && ri <= dataRows.length ? dataRows[ri - 1] : null;
          const isHeader = ri === 0;
          const isFiller = ri >= 1 + dataRows.length;
          const isLastRow = ri === totalRows - 1;

          return (
            <div
              key={rowNum}
              className={`${styles.row}${room?.isMember ? ` ${styles.memberRow}` : ''}${isFiller ? ` ${styles.fillerRow}` : ''}${
                isFiller && isLastRow ? ` ${styles.fillerRowStretch}` : ''
              }`}
            >
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
                      extraClass +=
                        room.status === 'playing'
                          ? ` ${styles.playing}`
                          : ` ${styles.waiting}`;
                      break;
                    case 2:
                      value = `${room.playerCount}/${room.maxPlayers}`;
                      break;
                    case 3:
                      value = room.ownerNickname;
                      break;
                    case 4:
                      value = room.versionName ?? room.versionId ?? 'standard-2014';
                      break;
                    case 5:
                      value = room.joinLabel ?? (room.isSandbox ? '测试房' : '加入');
                      extraClass += ` ${styles.linkCell}`;
                      break;
                    default:
                      break;
                  }
                  if (ci === 0 || ci === 5) {
                    onClick = () => {
                      onSelectCell(ref);
                      if (isGuest) {
                        onGuestAction?.();
                        return;
                      }
                      onJoinRoom(room.code);
                    };
                  }
                }

                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${
                      ref === selectedCell ? styles.selected : ''
                    } ${extraClass}`}
                    style={{ minWidth: COL_WIDTHS[ci], width: COL_WIDTHS[ci] }}
                    onClick={onClick}
                    title={(ci === 0 || ci === 5) && room ? (isGuest ? '请先登录' : `${room.joinLabel ?? '加入'}房间`) : undefined}
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
