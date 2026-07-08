import { CardRegistry } from '@tk/engine';
import { ChatMessage, Room, RoomPlayer } from '@tk/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HandCardPick } from '../../types/hand';
import { COL_LABELS } from '../../data/decoy';
import { formatCharacterLine, formatPlayerName, splitLogLineForSuitColors, stripGeneralPrefixInText } from '../../utils/display';
import { formatChatTime } from '../../utils/chatTime';
import { useCellFiller } from '../../utils/useCellFiller';
import styles from './SpreadsheetGrid.module.css';

const HEADERS = ['用户', '武将', '技能', '血量', '手牌', '装备区', '判定区', '回合状态'];
const COL_WIDTHS = [180, 140, 72, 62, 80, 150, 110, 96];
const DATA_COL_COUNT = HEADERS.length;
const ROWS_PER_PLAYER = 2;

interface BattleGridProps {
  room: Room;
  chatMessages: ChatMessage[];
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedHand: HandCardPick | null;
  onSelectCell: (ref: string) => void;
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onViewSkills: (player: RoomPlayer) => void;
  onViewProfile?: (player: RoomPlayer) => void;
  onViewChatProfile?: (message: ChatMessage) => void;
  onViewCard: (cardName: string) => void;
  onSendChat: (content: string) => void;
}

function formatEquipmentName(name: string): string {
  const card = CardRegistry.getByName(name);
  const label = stripGeneralPrefixInText(name);
  if (!card) return label;
  if (card.subType === 'horse_plus') return `${label}（+1马）`;
  if (card.subType === 'horse_minus') return `${label}（-1马）`;
  return label;
}

function isPlayerDead(player: RoomPlayer): boolean {
  return (player.hp ?? 0) <= 0;
}

function renderFillerCells(
  rowNum: number,
  allCols: string[],
  fillerColCount: number,
  selectedCell: string,
  onSelectCell: (ref: string) => void,
) {
  return Array.from({ length: fillerColCount }, (_, index) => {
    const col = allCols[DATA_COL_COUNT + index];
    const ref = `${col}${rowNum}`;
    return (
      <div
        key={ref}
        className={`${styles.fillerCell} ${ref === selectedCell ? styles.selected : ''}`}
        onClick={() => onSelectCell(ref)}
      />
    );
  });
}

export function BattleGrid({
  room,
  chatMessages,
  playerId,
  actingPlayerId,
  selectedCell,
  onSelectCell,
  onViewSkills,
  onViewProfile,
  onViewChatProfile,
  onViewCard,
  onSendChat,
}: BattleGridProps) {
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [room.sandbox?.log]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const cols = COL_LABELS.slice(0, DATA_COL_COUNT);
  const acting = actingPlayerId ?? playerId;
  const turnPlayer =
    room.sandbox != null ? room.players[room.sandbox.turnIndex] : null;
  const playerStartRow = 2;
  const logs = room.sandbox?.log ?? [];
  const orderedLogs = [...logs].reverse();
  const dataRowCount = playerStartRow + room.players.length * ROWS_PER_PLAYER;
  const filler = useCellFiller(wrapRef, dataRowCount, DATA_COL_COUNT);
  const allCols = useMemo(
    () => Array.from(
      { length: DATA_COL_COUNT + filler.cols },
      (_, index) => COL_LABELS[index] ?? `C${index + 1}`,
    ),
    [filler.cols],
  );
  const totalRows = dataRowCount + filler.rows;

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatInput('');
  };

  const renderPlayerRow = (
    player: RoomPlayer,
    rowNum: number,
    isDataRow: boolean,
  ) => {
    if (!isDataRow) {
      return (
        <div key={`${player.id}-spacer`} className={styles.row}>
          <div className={styles.rowHeader}>{rowNum}</div>
          {cols.map((col, index) => (
            <div
              key={`${col}${rowNum}`}
              className={styles.cell}
              style={{ minWidth: COL_WIDTHS[index], width: COL_WIDTHS[index] }}
            />
          ))}
          {renderFillerCells(rowNum, allCols, filler.cols, selectedCell, onSelectCell)}
        </div>
      );
    }

    const isHost = player.id === room.hostId;
    const isTurn = turnPlayer?.id === player.id;
    const isActing = acting === player.id;
    const handCount = player.handCards?.length ?? 0;
    const isDead = isPlayerDead(player);

    let rowClass = '';
    if (isDead) rowClass = styles.deadRow;
    else if (isTurn) rowClass = styles.turnRow;
    else if (isActing) rowClass = styles.myRow;

    return (
      <div key={player.id} className={`${styles.row} ${rowClass}`}>
        <div className={styles.rowHeader}>{rowNum}</div>
        {cols.map((col, columnIndex) => {
          const ref = `${col}${rowNum}`;
          const width = COL_WIDTHS[columnIndex];
          const baseClassName = `${styles.cell} ${
            ref === selectedCell ? styles.selected : ''
          }`;

          if (columnIndex === 0) {
            const label = formatPlayerName(player, isHost);
            return (
              <div
                key={ref}
                className={`${baseClassName} ${styles.linkCell}`}
                style={{ minWidth: width, width }}
                onClick={() => {
                  onSelectCell(ref);
                  onViewProfile?.(player);
                }}
              >
                {label}
                {isDead ? <span className={styles.deadTag}>（阵亡）</span> : null}
              </div>
            );
          }

          if (columnIndex === 1) {
            return (
              <div
                key={ref}
                className={baseClassName}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {formatCharacterLine(player)}
              </div>
            );
          }

          if (columnIndex === 2) {
            return (
              <div
                key={ref}
                className={`${baseClassName} ${styles.linkCell}`}
                style={{ minWidth: width, width }}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (isDead) return;
                  event.stopPropagation();
                  onViewSkills(player);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isDead) onViewSkills(player);
                }}
              >
                点击查看
              </div>
            );
          }

          if (columnIndex === 3) {
            return (
              <div
                key={ref}
                className={`${baseClassName} ${styles.numeric}`}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {player.hp ?? 4}/{player.maxHp ?? 4}
              </div>
            );
          }

          if (columnIndex === 4) {
            return (
              <div
                key={ref}
                className={`${baseClassName} ${styles.handCell}`}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {handCount > 0 ? `${handCount}张` : '—'}
              </div>
            );
          }

          if (columnIndex === 5) {
            return (
              <div
                key={ref}
                className={baseClassName}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {(player.equipment?.length ?? 0) > 0 ? (
                  <div className={styles.inlineList}>
                    {(player.equipment ?? []).map((name, equipmentIndex) => (
                      <button
                        key={`${ref}-${equipmentIndex}-${name}`}
                        type="button"
                        className={styles.inlineLink}
                        onClick={(event) => {
                          event.stopPropagation();
                          onViewCard(name);
                        }}
                        title={`查看【${formatEquipmentName(name)}】说明`}
                      >
                        {formatEquipmentName(name)}
                      </button>
                    ))}
                  </div>
                ) : (
                  '—'
                )}
              </div>
            );
          }

          if (columnIndex === 6) {
            return (
              <div
                key={ref}
                className={baseClassName}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {(player.judgeCards?.length ?? 0) > 0 ? (
                  <div className={styles.inlineList}>
                    {(player.judgeCards ?? []).map((name, judgeIndex) => (
                      <button
                        key={`${ref}-${judgeIndex}-${name}`}
                        type="button"
                        className={styles.inlineLink}
                        onClick={(event) => {
                          event.stopPropagation();
                          onViewCard(name);
                        }}
                        title={`查看【${stripGeneralPrefixInText(name)}】说明`}
                      >
                        {stripGeneralPrefixInText(name)}
                      </button>
                    ))}
                  </div>
                ) : (
                  '—'
                )}
              </div>
            );
          }

          if (columnIndex === 7) {
            return (
              <div
                key={ref}
                className={baseClassName}
                style={{ minWidth: width, width }}
                onClick={() => onSelectCell(ref)}
              >
                {isDead ? (
                  <span className={styles.deadMark}>已阵亡</span>
                ) : isTurn ? (
                  <span className={styles.turnMark}>→当前回合</span>
                ) : ''}
              </div>
            );
          }

          return null;
        })}
        {renderFillerCells(rowNum, allCols, filler.cols, selectedCell, onSelectCell)}
      </div>
    );
  };

  return (
    <div className={`${styles.boardLayout} ${sideCollapsed ? styles.sideCollapsed : ''}`}>
      <div className={styles.gridPane}>
        <div className={styles.wrap} ref={wrapRef}>
          <div className={styles.corner} />
          <div className={styles.colHeaders}>
            {cols.map((col, index) => (
              <div
                key={col}
                className={styles.colHeader}
                style={{ minWidth: COL_WIDTHS[index], width: COL_WIDTHS[index] }}
              >
                {col}
              </div>
            ))}
            {allCols.slice(DATA_COL_COUNT).map((col) => (
              <div key={col} className={styles.colHeader}>
                {col}
              </div>
            ))}
            {filler.cols === 0 ? <div className={styles.colHeaderFlex} /> : null}
          </div>
          <div className={styles.body}>
            <div className={styles.row}>
              <div className={styles.rowHeader}>1</div>
              {cols.map((col, index) => {
                const ref = `${col}1`;
                return (
                  <div
                    key={ref}
                    className={`${styles.cell} ${styles.headerCell} ${
                      ref === selectedCell ? styles.selected : ''
                    }`}
                    style={{ minWidth: COL_WIDTHS[index], width: COL_WIDTHS[index] }}
                    onClick={() => onSelectCell(ref)}
                  >
                    {HEADERS[index]}
                  </div>
                );
              })}
              {renderFillerCells(1, allCols, filler.cols, selectedCell, onSelectCell)}
            </div>

            {room.players.map((player, index) => {
              const dataRow = playerStartRow + index * ROWS_PER_PLAYER;
              const spacerRow = dataRow + 1;
              return (
                <div key={player.id}>
                  {renderPlayerRow(player, dataRow, true)}
                  {renderPlayerRow(player, spacerRow, false)}
                </div>
              );
            })}

            {Array.from(
              {
                length: totalRows - dataRowCount,
              },
              (_, index) => {
                const rowNum = dataRowCount + index;
                const isLastRow = index === totalRows - dataRowCount - 1;
                return (
                  <div
                    key={rowNum}
                    className={`${styles.row} ${styles.fillerRow}${isLastRow ? ` ${styles.fillerRowStretch}` : ''}`}
                  >
                    <div className={styles.rowHeader}>{rowNum}</div>
                    {cols.map((col, columnIndex) => (
                      <div
                        key={`${col}${rowNum}`}
                        className={styles.cell}
                        style={{
                          minWidth: COL_WIDTHS[columnIndex],
                          width: COL_WIDTHS[columnIndex],
                        }}
                        onClick={() => onSelectCell(`${col}${rowNum}`)}
                      />
                    ))}
                    {renderFillerCells(rowNum, allCols, filler.cols, selectedCell, onSelectCell)}
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      <aside className={`${styles.sidePane} ${sideCollapsed ? styles.collapsed : ''}`}>
        <section className={styles.sidePanel}>
          <div className={styles.sidePanelTitle}>
            <span>操作记录</span>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={() => setSideCollapsed(!sideCollapsed)}
              title={sideCollapsed ? '展开' : '折叠'}
            >
              {sideCollapsed ? '▶' : '◀'}
            </button>
          </div>
          <div className={styles.logScroll} ref={logScrollRef}>
            {orderedLogs.length === 0 ? (
              <div className={styles.emptyPanelLine}>暂无操作记录</div>
            ) : (
              orderedLogs.map((line, index) => (
                <div
                  key={`log-${index}`}
                  className={`${styles.logLine} ${
                    line.includes('判定') ? styles.judgeLogLine : ''
                  }`}
                >
                  {splitLogLineForSuitColors(line).map((segment, segmentIndex) =>
                    segment.redSuit ? (
                      <span key={`${index}-${segmentIndex}`} className={styles.redSuit}>
                        {segment.text}
                      </span>
                    ) : (
                      <span key={`${index}-${segmentIndex}`}>{segment.text}</span>
                    ),
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className={styles.sidePanel}>
          <div className={styles.sidePanelTitle}>聊天区</div>
          <div className={styles.logScroll} ref={chatScrollRef}>
            {chatMessages.length === 0 ? (
              <div className={styles.emptyPanelLine}>暂无聊天消息</div>
            ) : (
              chatMessages.map((message) => (
                <div key={message.id} className={styles.chatLine}>
                  <button
                    type="button"
                    className={styles.chatNameBtn}
                    onClick={() => onViewChatProfile?.(message)}
                    title="查看玩家资料"
                  >
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
            <button
              type="button"
              className={styles.chatSendBtn}
              onClick={handleChatSubmit}
              disabled={!chatInput.trim()}
            >
              发送
            </button>
          </div>
        </section>
      </aside>
      {sideCollapsed && (
        <div className={styles.collapseToggle}>
          <button
            type="button"
            className={styles.collapseBtnToggle}
            onClick={() => setSideCollapsed(false)}
            title="展开"
          >
开
          </button>
        </div>
      )}
    </div>
  );
}
