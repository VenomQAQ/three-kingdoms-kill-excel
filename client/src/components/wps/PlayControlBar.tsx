import { CardRegistry, CharacterRegistry, GameTiming } from '@tk/engine';
import { RoomPlayer } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { isHandSelected } from '../../types/hand';
import { formatGeneralName, stripGeneralPrefixInText } from '../../utils/display';
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
  prepare: '准备阶段',
  judge: '判定阶段',
  before_draw: '摸牌前',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
};

function equipmentSkillLabel(cardName: string): string | null {
  const card = CardRegistry.getByName(cardName);
  if (!card || card.type !== 'equipment') return null;
  return stripGeneralPrefixInText(card.name);
}

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

  const currentSkills = (() => {
    if (!actingPlayer) return [];
    const character = CharacterRegistry.resolve(
      actingPlayer.general ?? actingPlayer.nickname,
    );
    if (!character) return [];
    return character.skills.filter((skill) => skill.timings.includes(GameTiming.PHASE_PLAY));
  })();

  const equipmentSkills = (actingPlayer?.equipment ?? [])
    .map((name) => equipmentSkillLabel(name))
    .filter((label): label is string => !!label);

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
          onChange={(event) => onSwitchActor(event.target.value)}
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {formatGeneralName(player)}
              {player.isVirtual ? '（虚拟）' : ''}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.item}>
        <span className={styles.label}>当前回合</span>
        <strong className={styles.turnName}>
          {formatGeneralName(turnPlayer) || '—'}
        </strong>
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.cards}>
        <span className={styles.label}>手牌</span>
        {hand.length === 0 ? (
          <span className={styles.empty}>无</span>
        ) : (
          hand.map((card, index) => (
            <button
              key={`${card}-${index}`}
              type="button"
              className={`${styles.chip} ${
                isHandSelected(selectedHand, card, index) ? styles.chipOn : ''
              }`}
              onClick={() => onSelectHand(card, index)}
              onDoubleClick={() => isMyTurn && onPlayCard(card, index)}
              disabled={!isMyTurn}
              title={isMyTurn ? `单击选中，双击打出 ${card}` : '非当前回合角色'}
            >
              {card}
            </button>
          ))
        )}
      </div>
      <span className={styles.sep}>|</span>
      <div className={styles.skills}>
        <span className={styles.label}>技能</span>
        {currentSkills.length || equipmentSkills.length ? (
          <>
            {currentSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={styles.quickBtn}
                disabled={!isMyTurn || turnPhase !== 'play'}
                onClick={() => onUseSkill(skill.id)}
                title={stripGeneralPrefixInText(skill.description)}
              >
                {stripGeneralPrefixInText(skill.name)}
              </button>
            ))}
            {equipmentSkills.map((label) => (
              <span key={label} className={styles.equipSkill} title={`装备技能：${label}`}>
                {label}
              </span>
            ))}
          </>
        ) : (
          <span className={styles.empty}>无</span>
        )}
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
          className={styles.endTurn}
          disabled={!isMyTurn}
          onClick={onEndTurn}
        >
          结束回合
        </button>
      </div>
      {!isMyTurn && actingPlayer && turnPlayer && (
        <span className={styles.hint}>
          请先把操控切换到“{formatGeneralName(turnPlayer)}”再出牌
        </span>
      )}
    </div>
  );
}
