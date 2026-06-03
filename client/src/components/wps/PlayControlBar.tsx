import { RoomPlayer } from '@tk/shared';
import styles from './PlayControlBar.module.css';

interface PlayControlBarProps {
  actingPlayer: RoomPlayer | undefined;
  turnPlayer: RoomPlayer | undefined;
  selectedCard: string | null;
  canOperate: boolean;
  players: RoomPlayer[];
  onSelectCard: (card: string) => void;
  onPlayCard: (card: string) => void;
  onEndTurn: () => void;
  onSwitchActor: (playerId: string) => void;
}

const QUICK_CARDS = ['杀', '闪', '桃', '酒', '无懈可击'];

export function PlayControlBar({
  actingPlayer,
  turnPlayer,
  selectedCard,
  canOperate,
  players,
  onSelectCard,
  onPlayCard,
  onEndTurn,
  onSwitchActor,
}: PlayControlBarProps) {
  const hand = actingPlayer?.handCards ?? [];
  const isMyTurn = canOperate;

  return (
    <div className={styles.bar}>
      <div className={styles.phase}>
        <span className={styles.phaseTag}>
          {isMyTurn ? '出牌阶段' : '等待阶段'}
        </span>
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.item}>
        <span className={styles.label}>操控</span>
        <select
          className={styles.select}
          value={actingPlayer?.id ?? ''}
          onChange={(e) => onSwitchActor(e.target.value)}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
              {p.isVirtual ? ' (虚拟)' : ''}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.item}>
        <span className={styles.label}>当前回合</span>
        <strong className={styles.turnName}>
          {turnPlayer?.general ?? turnPlayer?.nickname ?? '—'}
        </strong>
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.cards}>
        <span className={styles.label}>手牌</span>
        {hand.length === 0 ? (
          <span className={styles.empty}>无</span>
        ) : (
          hand.map((card, i) => (
            <button
              key={`${card}-${i}`}
              type="button"
              className={`${styles.chip} ${
                selectedCard === card ? styles.chipOn : ''
              }`}
              onClick={() => onSelectCard(card)}
              onDoubleClick={() => isMyTurn && onPlayCard(card)}
              disabled={!isMyTurn}
              title={
                isMyTurn
                  ? `单击选中，双击打出【${card}】`
                  : '非你的回合'
              }
            >
              {card}
            </button>
          ))
        )}
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.quick}>
        {QUICK_CARDS.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.quickBtn}
            disabled={!isMyTurn || !hand.includes(c)}
            onClick={() => onPlayCard(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!isMyTurn || !selectedCard}
          onClick={() => selectedCard && onPlayCard(selectedCard)}
        >
          打出选中
        </button>
        <button
          type="button"
          className={styles.endTurn}
          disabled={!isMyTurn}
          onClick={onEndTurn}
        >
          结束回合
        </button>
      </div>
      {!isMyTurn && actingPlayer && turnPlayer && (
        <span className={styles.hint}>
          请用下拉框切换到「{turnPlayer.nickname}」再出牌
        </span>
      )}
    </div>
  );
}
