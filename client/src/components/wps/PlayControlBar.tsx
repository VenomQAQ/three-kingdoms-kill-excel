import { RoomPlayer } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { cardNameFromHand, isHandSelected } from '../../types/hand';
import styles from './PlayControlBar.module.css';

interface PlayControlBarProps {
  actingPlayer: RoomPlayer | undefined;
  turnPlayer: RoomPlayer | undefined;
  turnPhase?: string;
  selectedHand: HandCardPick | null;
  canOperate: boolean;
  players: RoomPlayer[];
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onEndTurn: () => void;
  onUseSkill: (skillId: string) => void;
  onSwitchActor: (playerId: string) => void;
}

const PHASE_LABEL: Record<string, string> = {
  judge: '判定阶段',
  before_draw: '摸牌前',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
};

const QUICK_CARDS = ['杀', '闪', '桃', '酒', '无懈可击'];

export function PlayControlBar({
  actingPlayer,
  turnPlayer,
  turnPhase,
  selectedHand,
  canOperate,
  players,
  onSelectHand,
  onPlayCard,
  onEndTurn,
  onUseSkill,
  onSwitchActor,
}: PlayControlBarProps) {
  const hand = actingPlayer?.handCards ?? [];
  const isMyTurn = canOperate;
  const phaseLabel =
    turnPhase && PHASE_LABEL[turnPhase]
      ? PHASE_LABEL[turnPhase]
      : isMyTurn
        ? '出牌阶段'
        : '等待阶段';

  return (
    <div className={styles.bar}>
      <div className={styles.phase}>
        <span className={styles.phaseTag}>{phaseLabel}</span>
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
                isHandSelected(selectedHand, card, i) ? styles.chipOn : ''
              }`}
              onClick={() => onSelectHand(card, i)}
              onDoubleClick={() => isMyTurn && onPlayCard(card, i)}
              disabled={!isMyTurn}
              title={
                isMyTurn
                  ? `单击选中，双击打出 ${card}`
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
            disabled={!isMyTurn || !hand.some((h) => cardNameFromHand(h) === c)}
            onClick={() => {
              const idx =
                selectedHand && cardNameFromHand(selectedHand.name) === c
                  ? selectedHand.index
                  : hand.findIndex((h) => cardNameFromHand(h) === c);
              onPlayCard(c, idx >= 0 ? idx : undefined);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!isMyTurn || !selectedHand}
          onClick={() =>
            selectedHand && onPlayCard(selectedHand.name, selectedHand.index)
          }
        >
          打出选中
        </button>
        <button
          type="button"
          className={styles.quickBtn}
          disabled={!isMyTurn || turnPhase !== 'play'}
          onClick={() => onUseSkill('rende')}
          title="界刘备【仁德】"
        >
          仁德
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
