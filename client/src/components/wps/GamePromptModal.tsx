import { CardRegistry } from '@tk/engine';
import type { GamePrompt, PromptSkillInfo, Room, RoomPlayer } from '@tk/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  formatGeneralName,
  stripGeneralPrefixInText,
  toChineseCount,
} from '../../utils/display';
import styles from './GameModal.module.css';

interface GamePromptModalProps {
  room: Room;
  prompt: GamePrompt;
  actingPlayer: RoomPlayer | undefined;
  onConfirmPlay: (promptId: string, choiceId: string) => void;
  onSelectTargets: (promptId: string, targetIds: string[]) => void;
  onSubmitResponse: (promptId: string, choiceId: string) => void;
  onRendeGive: (targetId: string, cards: string[], handIndices: number[]) => void;
  onRendeFinish: () => void;
  onZhihengConfirm: (handIndices: number[]) => void;
  onModifyJudge: (promptId: string, handIndex: number) => void;
  onSkipModifyJudge: (promptId: string) => void;
  onDiscardCards: (promptId: string, handIndices: number[]) => void;
  onSelectZoneCard: (promptId: string, choiceId: string) => void;
  onClose?: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  judge: '判定阶段',
  before_draw: '摸牌前',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
};

function SkillListSection({ skills }: { skills: PromptSkillInfo[] }) {
  if (!skills.length) return null;

  return (
    <section className={styles.section}>
      <h3>当前角色技能</h3>
      <ul className={styles.skillList}>
        {skills.map((skill) => (
          <li key={skill.id}>
            <strong>
              {stripGeneralPrefixInText(skill.name)}
              {skill.type === 'lord'
                ? '【主公技】'
                : skill.type === 'locked'
                  ? '【锁定技】'
                  : ''}
            </strong>
            <p>{stripGeneralPrefixInText(skill.description)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CardPickChips({
  cards,
  selectedIndices,
  onToggle,
}: {
  cards: string[];
  selectedIndices: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className={styles.cardChipList}>
      {cards.map((card, index) => {
        const active = selectedIndices.includes(index);
        return (
          <button
            key={`${card}-${index}`}
            type="button"
            className={`${styles.cardChip} ${active ? styles.cardChipActive : ''}`}
            onClick={() => onToggle(index)}
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}

export function GamePromptModal({
  room,
  prompt,
  actingPlayer,
  onConfirmPlay,
  onSelectTargets,
  onSubmitResponse,
  onRendeGive,
  onRendeFinish,
  onZhihengConfirm,
  onModifyJudge,
  onSkipModifyJudge,
  onDiscardCards,
  onSelectZoneCard,
  onClose,
}: GamePromptModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [rendeTarget, setRendeTarget] = useState('');
  const [rendeCardIndices, setRendeCardIndices] = useState<number[]>([]);
  const [zhihengCardIndices, setZhihengCardIndices] = useState<number[]>([]);
  const [modifyJudgeIndex, setModifyJudgeIndex] = useState<number | null>(null);
  const [discardIndices, setDiscardIndices] = useState<number[]>([]);
  const [zonePickId, setZonePickId] = useState('');

  useEffect(() => {
    setSelectedTargets([]);
    setRendeTarget('');
    setRendeCardIndices([]);
    setZhihengCardIndices([]);
    setModifyJudgeIndex(null);
    setDiscardIndices([]);
    setZonePickId('');
  }, [prompt.id]);

  const cardDef = prompt.cardName ? CardRegistry.getByName(prompt.cardName) : undefined;
  const targetMin = cardDef?.targeting.count?.min ?? 1;
  const targetMax = cardDef?.targeting.count?.max ?? 1;
  const singleTarget = targetMax <= 1;
  const sourcePlayer = room.players.find((player) => player.id === prompt.sourcePlayerId);
  const promptActor = room.players.find((player) => player.id === prompt.playerId);
  const judgeTarget = prompt.judgeTargetId
    ? room.players.find((player) => player.id === prompt.judgeTargetId)
    : undefined;
  const turnPhase = room.sandbox?.turnPhase;
  const validTargets = (prompt.validTargetIds ?? [])
    .map((id) => room.players.find((player) => player.id === id))
    .filter((player): player is RoomPlayer => !!player);

  const isGiveCardsSkill =
    prompt.type === 'use_skill' &&
    !!prompt.skillId &&
    (prompt.options?.some((option) => option.id.endsWith(':finish')) ?? false);
  const isZhiheng = prompt.type === 'use_skill' && prompt.skillId === 'zhiheng';
  const isModifyJudge = prompt.type === 'modify_judge';
  const isDiscard = prompt.type === 'discard_cards';
  const isZonePick = prompt.type === 'select_zone_card';
  const isWuxieResponse =
    prompt.type === 'response' &&
    prompt.validResponseCards?.includes('无懈可击') === true &&
    !!sourcePlayer &&
    (prompt.targetPlayerIds?.length ?? 0) > 0;
  const discardNeed = prompt.discardCount ?? 0;
  const noLegalTargets =
    (prompt.type === 'select_targets' ||
      (prompt.type === 'use_skill' && Array.isArray(prompt.validTargetIds))) &&
    validTargets.length === 0;

  const title = useMemo(() => {
    if (prompt.type === 'play_card_confirm') {
      return prompt.cardName
        ? `确认使用【${stripGeneralPrefixInText(prompt.cardName)}】？`
        : '确认动作';
    }
    if (prompt.type === 'select_targets') {
      return prompt.cardName
        ? `请选择【${stripGeneralPrefixInText(prompt.cardName)}】目标`
        : '请选择目标';
    }
    if (prompt.type === 'select_zone_card') {
      return '请选择目标区域中的一张牌';
    }
    if (prompt.type === 'discard_cards') {
      return `弃置${toChineseCount(discardNeed)}张手牌（${discardIndices.length}/${discardNeed}）`;
    }
    if (prompt.type === 'modify_judge') {
      return '是否发动改判？';
    }
    if (prompt.type === 'response') {
      return '请进行响应';
    }
    if (isGiveCardsSkill) {
      return `请选择【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】目标`;
    }
    if (isZhiheng) {
      return `弃置手牌（${zhihengCardIndices.length}）`;
    }
    if (prompt.type === 'use_skill') {
      return `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】`;
    }
    return '确认动作';
  }, [
    discardIndices.length,
    discardNeed,
    isGiveCardsSkill,
    isZhiheng,
    prompt.cardName,
    prompt.skillName,
    prompt.type,
    zhihengCardIndices.length,
  ]);

  const showSkills =
    prompt.characterSkills &&
    prompt.characterSkills.length > 0 &&
    (prompt.type === 'play_card_confirm' ||
      prompt.type === 'use_skill' ||
      prompt.type === 'modify_judge');

  const rendeHand = actingPlayer?.handCards ?? [];
  const zhihengHand = actingPlayer?.handCards ?? [];
  const modifyHand = promptActor?.handCards ?? [];
  const handForDiscard = actingPlayer?.handCards ?? [];
  const zonePickTarget = (prompt.targetPlayerIds ?? [])[0]
    ? room.players.find((player) => player.id === prompt.targetPlayerIds![0])
    : undefined;
  const wuxieTargetNames = (prompt.targetPlayerIds ?? [])
    .map((id) => room.players.find((player) => player.id === id))
    .filter((player): player is RoomPlayer => !!player)
    .map((player) => formatGeneralName(player));

  const toggleTarget = (id: string) => {
    setSelectedTargets((previous) => {
      if (singleTarget) return previous[0] === id ? [] : [id];
      if (previous.includes(id)) return previous.filter((value) => value !== id);
      if (previous.length >= targetMax) return previous;
      return [...previous, id];
    });
  };

  const toggleRendeCard = (index: number) => {
    setRendeCardIndices((previous) =>
      previous.includes(index)
        ? previous.filter((value) => value !== index)
        : [...previous, index],
    );
  };

  const toggleZhihengCard = (index: number) => {
    setZhihengCardIndices((previous) =>
      previous.includes(index)
        ? previous.filter((value) => value !== index)
        : [...previous, index],
    );
  };

  const toggleDiscardCard = (index: number) => {
    setDiscardIndices((previous) => {
      if (previous.includes(index)) return previous.filter((value) => value !== index);
      if (previous.length >= discardNeed) return previous;
      return [...previous, index];
    });
  };

  const canConfirmTargets =
    selectedTargets.length >= targetMin && selectedTargets.length <= targetMax;

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.panelWide} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2>{title}</h2>
            {turnPhase && (
              <span className={styles.phaseTag}>
                {PHASE_LABEL[turnPhase] ?? turnPhase}
              </span>
            )}
          </div>
          {onClose && (
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div className={styles.body}>
          {prompt.message && (
            <p className={styles.message}>
              {isWuxieResponse && sourcePlayer
                ? `${formatGeneralName(sourcePlayer)}对${wuxieTargetNames.join('、')}使用【${stripGeneralPrefixInText(prompt.cardName ?? '')}】`
                : prompt.message}
            </p>
          )}

          {actingPlayer && (
            <section className={styles.section}>
              <h3>当前操控</h3>
              <p className={styles.inlineMeta}>
                【{actingPlayer.role ?? '未知'}】{formatGeneralName(actingPlayer)} 体力:
                {actingPlayer.hp ?? 0} 手牌:{actingPlayer.handCards?.length ?? 0}
              </p>
            </section>
          )}

          {showSkills && prompt.characterSkills && (
            <SkillListSection skills={prompt.characterSkills} />
          )}

          {noLegalTargets && (
            <section className={styles.section}>
              <p className={styles.notice}>当前没有合法的目标角色。</p>
            </section>
          )}

          {isModifyJudge && (
            <section className={styles.section}>
              <h3>判定信息</h3>
              <p>
                被判定：{formatGeneralName(judgeTarget) || '—'} · 【
                {prompt.judgeCardName ?? '未知'}】
              </p>
              <p>当前判定结果：{prompt.judgeResult}</p>
              <p className={styles.muted}>选择一张手牌打出，替换当前判定结果。</p>
              <ul className={styles.cardPickList}>
                {modifyHand.map((card, index) => (
                  <li key={`${card}-${index}`}>
                    <label className={styles.targetOption}>
                      <input
                        type="radio"
                        name="modify-judge-card"
                        checked={modifyJudgeIndex === index}
                        onChange={() => setModifyJudgeIndex(index)}
                      />
                      <span>【{card}】</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={modifyJudgeIndex == null}
                  onClick={() => {
                    if (modifyJudgeIndex != null) onModifyJudge(prompt.id, modifyJudgeIndex);
                  }}
                >
                  发动【{prompt.skillName ?? '改判'}】
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onSkipModifyJudge(prompt.id)}
                >
                  不改判
                </button>
              </div>
            </section>
          )}

          {promptActor && prompt.type === 'response' && (
            <section className={styles.section}>
              <h3>响应角色</h3>
              <p>
                {formatGeneralName(promptActor)} · 手牌 {promptActor.handCards?.length ?? 0} 张
              </p>
            </section>
          )}

          {cardDef && (
            <section className={styles.section}>
              <h3>卡牌说明 · 【{stripGeneralPrefixInText(cardDef.name)}】</h3>
              <p>{stripGeneralPrefixInText(cardDef.description)}</p>
              <p className={styles.muted}>类型：{cardDef.type}</p>
            </section>
          )}

          {prompt.type === 'select_targets' && (
            <section className={styles.section}>
              <h3>选择使用目标</h3>
              {!noLegalTargets && (
                <ul className={styles.targetList}>
                  {validTargets.map((target) => (
                    <li key={target.id}>
                      <label className={styles.targetOption}>
                        <input
                          type={singleTarget ? 'radio' : 'checkbox'}
                          name="play-target"
                          checked={selectedTargets.includes(target.id)}
                          onChange={() => toggleTarget(target.id)}
                        />
                        <span>
                          【{target.role ?? '未知'}】{formatGeneralName(target)} 体力:
                          {target.hp ?? 0}/{target.maxHp ?? 0}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={styles.primary}
                disabled={noLegalTargets || !canConfirmTargets}
                onClick={() => onSelectTargets(prompt.id, selectedTargets)}
              >
                确认目标
              </button>
            </section>
          )}

          {isGiveCardsSkill && (
            <section className={styles.section}>
              <h3>给出手牌</h3>
              {!noLegalTargets && (
                <>
                  <label className={styles.fieldLabel}>
                    目标角色
                    <select
                      className={styles.select}
                      value={rendeTarget}
                      onChange={(event) => setRendeTarget(event.target.value)}
                    >
                      <option value="">请选择目标角色</option>
                      {validTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {formatGeneralName(target)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.muted}>下面是卡牌列表：</p>
                  <CardPickChips
                    cards={rendeHand}
                    selectedIndices={rendeCardIndices}
                    onToggle={toggleRendeCard}
                  />
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={noLegalTargets || !rendeTarget || rendeCardIndices.length === 0}
                  onClick={() => {
                    const cards = rendeCardIndices.map((index) => rendeHand[index]!);
                    onRendeGive(rendeTarget, cards, rendeCardIndices);
                    setRendeCardIndices([]);
                  }}
                >
                  给出手牌（{rendeCardIndices.length}）
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onRendeFinish()}
                >
                  {prompt.options?.find((option) => option.id.endsWith(':finish'))?.label ?? '完成'}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'cancel')}
                >
                  取消
                </button>
              </div>
            </section>
          )}

          {isZhiheng && (
            <section className={styles.section}>
              <h3>弃置手牌（{zhihengCardIndices.length}）</h3>
              <p className={styles.muted}>下面是卡牌列表：</p>
              <CardPickChips
                cards={zhihengHand}
                selectedIndices={zhihengCardIndices}
                onToggle={toggleZhihengCard}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={zhihengCardIndices.length === 0}
                  onClick={() => onZhihengConfirm(zhihengCardIndices)}
                >
                  确认制衡
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'cancel')}
                >
                  取消并继续出牌
                </button>
              </div>
            </section>
          )}

          {isDiscard && (
            <section className={styles.section}>
              <h3>
                弃置{toChineseCount(discardNeed)}张手牌（{discardIndices.length}/{discardNeed}）
              </h3>
              <CardPickChips
                cards={handForDiscard}
                selectedIndices={discardIndices}
                onToggle={toggleDiscardCard}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={discardIndices.length !== discardNeed}
                  onClick={() => onDiscardCards(prompt.id, discardIndices)}
                >
                  确认弃牌
                </button>
              </div>
            </section>
          )}

          {isZonePick && (
            <section className={styles.section}>
              <h3>选择目标区域中的一张牌</h3>
              {zonePickTarget && (
                <p className={styles.muted}>
                  目标：{formatGeneralName(zonePickTarget)}（手牌
                  {zonePickTarget.handCards?.length ?? 0}张，装备
                  {zonePickTarget.equipment?.length ?? 0}件）
                </p>
              )}
              <ul className={styles.cardPickList}>
                {(prompt.zoneCardOptions ?? []).map((option) => (
                  <li key={option.id}>
                    <label className={styles.targetOption}>
                      <input
                        type="radio"
                        name="zone-pick-card"
                        checked={zonePickId === option.id}
                        onChange={() => setZonePickId(option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!zonePickId}
                  onClick={() => onSelectZoneCard(prompt.id, zonePickId)}
                >
                  确认选择
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'cancel')}
                >
                  取消
                </button>
              </div>
            </section>
          )}

          {prompt.options &&
            !isGiveCardsSkill &&
            !isZhiheng &&
            !isModifyJudge &&
            !isDiscard &&
            !isZonePick &&
            prompt.type !== 'select_targets' && (
              <div className={styles.actions}>
                {prompt.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      option.id === 'pass' || option.id === 'cancel'
                        ? styles.secondary
                        : styles.primary
                    }
                    onClick={() => {
                      if (prompt.type === 'response') {
                        onSubmitResponse(prompt.id, option.id);
                      } else {
                        onConfirmPlay(prompt.id, option.id);
                      }
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
