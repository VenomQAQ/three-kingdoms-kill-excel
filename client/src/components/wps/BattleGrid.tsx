import { Room, RoomPlayer } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { isHandSelected } from '../../types/hand';
import styles from './SpreadsheetGrid.module.css';
import { COL_LABELS } from '../../data/decoy';

const HEADERS = ['用户', '角色名', '技能', '血量', '手牌', '装备区', '判定区', '回合状态'];
const COL_WIDTHS = [minContentLogWidth(), 120, 68, 44, 210, 132, 100, 92];

/** 操作区日志列：保证长句可读 */
function minContentLogWidth(): number {
  return 480;
}
const ROWS_PER_PLAYER = 2;

interface BattleGridProps {
  room: Room;
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedHand: HandCardPick | null;
  onSelectCell: (ref: string) => void;
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onViewSkills: (player: RoomPlayer) => void;
}

export function BattleGrid({
  room,
  playerId,
  actingPlayerId,
  selectedCell,
  selectedHand,
  onSelectCell,
  onSelectHand,
  onPlayCard,
  onViewSkills,
}: BattleGridProps) {
  const cols = COL_LABELS.slice(0, HEADERS.length);
  const acting = actingPlayerId ?? playerId;
  const turnPlayer =
    room.sandbox != null ? room.players[room.sandbox.turnIndex] : null;
  const gamePrompt = room.sandbox?.prompt;
  const turnPhase = room.sandbox?.turnPhase;
  const isMyTurn = turnPlayer != null && acting === turnPlayer.id;
  const canPlayCards =
    isMyTurn && (turnPhase === 'play' || !turnPhase) && !gamePrompt;
  const canSelectHand = isMyTurn;

  const playerStartRow = 2;
  const operationRow = playerStartRow + room.players.length * ROWS_PER_PLAYER + 1;
  const logStartRow = operationRow + 1;
  const logs = room.sandbox?.log ?? [];
  const totalRows = Math.max(logStartRow + logs.length + 4, 32);

  const renderPlayerRow = (player: RoomPlayer, rowNum: number, isDataRow: boolean) => {
    if (!isDataRow) {
      return (
        <div key={`${player.id}-spacer`} className={styles.row}>
          <div className={styles.rowHeader}>{rowNum}</div>
          {cols.map((col) => (
            <div
              key={`${col}${rowNum}`}
              className={styles.cell}
              style={{ minWidth: COL_WIDTHS[cols.indexOf(col)], width: COL_WIDTHS[cols.indexOf(col)] }}
            />
          ))}
        </div>
      );
    }

    const isHost = player.id === room.hostId;
    const isTurn = turnPlayer?.id === player.id;
    const isActing = acting === player.id;
    const showHand = isActing;
    const handCards = player.handCards ?? [];

    let rowClass = '';
    if (isTurn) rowClass = styles.turnRow;
    else if (isActing) rowClass = styles.myRow;

    return (
      <div key={player.id} className={`${styles.row} ${rowClass}`}>
        <div className={styles.rowHeader}>{rowNum}</div>
        {cols.map((col, ci) => {
          const ref = `${col}${rowNum}`;
          const w = COL_WIDTHS[ci];
          const base = `${styles.cell} ${ref === selectedCell ? styles.selected : ''}`;

          if (ci === 0) {
            const label = isHost ? `「房主」${player.nickname}` : player.nickname;
            return (
              <div
                key={ref}
                className={base}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {label}
              </div>
            );
          }

          if (ci === 1) {
            const general = player.general ?? player.nickname;
            const role = player.role ?? '反贼';
            const isLord = role === '主公';
            return (
              <div
                key={ref}
                className={base}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {general}{' '}
                <span className={isLord ? styles.roleLord : styles.roleNormal}>
                  【{role}】
                </span>
              </div>
            );
          }

          if (ci === 2) {
            return (
              <div
                key={ref}
                className={`${base} ${styles.linkCell}`}
                style={{ minWidth: w, width: w }}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewSkills(player);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onViewSkills(player);
                }}
              >
                点击查看
              </div>
            );
          }

          if (ci === 3) {
            const hp = player.hp ?? 4;
            const max = player.maxHp ?? 4;
            return (
              <div
                key={ref}
                className={`${base} ${styles.numeric}`}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {hp}/{max}
              </div>
            );
          }

          if (ci === 4) {
            return (
              <div
                key={ref}
                className={`${base} ${styles.handCell}`}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {showHand ? (
                  handCards.length > 0 ? (
                    handCards.map((card, hi) => (
                      <button
                        key={`${card}-${hi}`}
                        type="button"
                        className={`${styles.cardChip} ${
                          isHandSelected(selectedHand, card, hi)
                            ? styles.cardChipSelected
                            : ''
                        } ${canSelectHand ? styles.cardChipPlayable : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canSelectHand) onSelectHand(card, hi);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (canPlayCards) onPlayCard(card, hi);
                        }}
                        title={
                          canPlayCards
                            ? `单击选中，双击打出【${card}】`
                            : canSelectHand
                              ? '当前阶段不能打出（须出牌阶段且无弹窗）'
                              : '请切换到当前回合角色'
                        }
                      >
                        {card}
                      </button>
                    ))
                  ) : (
                    '—'
                  )
                ) : (
                  `${handCards.length}张`
                )}
              </div>
            );
          }

          if (ci === 5) {
            const eq = (player.equipment ?? []).join('、') || '—';
            return (
              <div
                key={ref}
                className={base}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {eq}
              </div>
            );
          }

          if (ci === 6) {
            const judge = (player.judgeCards ?? []).join('、') || '—';
            return (
              <div
                key={ref}
                className={base}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {judge}
              </div>
            );
          }

          if (ci === 7) {
            return (
              <div
                key={ref}
                className={base}
                style={{ minWidth: w, width: w }}
                onClick={() => onSelectCell(ref)}
              >
                {isTurn ? (
                  <span className={styles.turnMark}>←当前回合</span>
                ) : (
                  ''
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

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
        {/* 表头 */}
        <div className={styles.row}>
          <div className={styles.rowHeader}>1</div>
          {cols.map((col, ci) => {
            const ref = `${col}1`;
            return (
              <div
                key={ref}
                className={`${styles.cell} ${styles.headerCell} ${ref === selectedCell ? styles.selected : ''}`}
                style={{ minWidth: COL_WIDTHS[ci], width: COL_WIDTHS[ci] }}
                onClick={() => onSelectCell(ref)}
              >
                {HEADERS[ci]}
              </div>
            );
          })}
        </div>

        {/* 玩家区：每人占 2 行 */}
        {room.players.map((player, idx) => {
          const dataRow = playerStartRow + idx * ROWS_PER_PLAYER;
          const spacerRow = dataRow + 1;
          return (
            <div key={player.id}>
              {renderPlayerRow(player, dataRow, true)}
              {renderPlayerRow(player, spacerRow, false)}
            </div>
          );
        })}

        {/* 操作区标题 */}
        <div className={styles.row}>
          <div className={styles.rowHeader}>{operationRow}</div>
          {cols.map((col, ci) => {
            const ref = `${col}${operationRow}`;
            return (
              <div
                key={ref}
                className={`${styles.cell} ${ci === 0 ? styles.opAreaTitle : ''} ${ref === selectedCell ? styles.selected : ''}`}
                style={{ minWidth: COL_WIDTHS[ci], width: COL_WIDTHS[ci] }}
                onClick={() => onSelectCell(ref)}
              >
                {ci === 0 ? '操作区' : ''}
              </div>
            );
          })}
        </div>

        {/* 操作日志 */}
        {logs.map((line, i) => {
          const rowNum = logStartRow + i;
          const logRef = `A${rowNum}`;
          return (
            <div key={rowNum} className={`${styles.row} ${styles.logRow}`}>
              <div className={styles.rowHeader}>{rowNum}</div>
              <div
                className={`${styles.cell} ${styles.logCell} ${logRef === selectedCell ? styles.selected : ''}`}
                style={{ minWidth: COL_WIDTHS[0], flex: '1 1 480px' }}
                onClick={() => onSelectCell(logRef)}
              >
                {line}
              </div>
              {cols.slice(1).map((col, ci) => {
                const ref = `${col}${rowNum}`;
                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${ref === selectedCell ? styles.selected : ''}`}
                    style={{
                      minWidth: COL_WIDTHS[ci + 1],
                      width: COL_WIDTHS[ci + 1],
                      flex: `0 0 ${COL_WIDTHS[ci + 1]}px`,
                    }}
                    onClick={() => onSelectCell(ref)}
                  />
                );
              })}
            </div>
          );
        })}

        {/* 填充空行 */}
        {Array.from({ length: totalRows - logStartRow - logs.length }, (_, i) => {
          const rowNum = logStartRow + logs.length + i;
          return (
            <div key={rowNum} className={styles.row}>
              <div className={styles.rowHeader}>{rowNum}</div>
              {cols.map((col, ci) => (
                <div
                  key={`${col}${rowNum}`}
                  className={styles.cell}
                  style={{ minWidth: COL_WIDTHS[ci], width: COL_WIDTHS[ci] }}
                  onClick={() => onSelectCell(`${col}${rowNum}`)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
