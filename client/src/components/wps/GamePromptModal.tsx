import { CardRegistry } from '@tk/engine';
import type { GamePrompt, PromptSkillInfo, Room, RoomPlayer } from '@tk/shared';
import { useEffect, useState } from 'react';
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
        {skills.map((s) => (
          <li key={s.id}>
            <strong>
              {s.name}
              {s.type === 'lord' ? '【主公技】' : s.type === 'locked' ? '【锁定技】' : ''}
            </strong>
            <p>{s.description}</p>
          </li>
        ))}
      </ul>
    </section>
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
}: GamePromptModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [rendeTarget, setRendeTarget] = useState('');
  const [rendeCardIndices, setRendeCardIndices] = useState<number[]>([]);
  const [zhihengCardIndices, setZhihengCardIndices] = useState<number[]>([]);
  const [modifyJudgeIndex, setModifyJudgeIndex] = useState<number | null>(null);
  const [discardIndices, setDiscardIndices] = useState<number[]>([]);
  const [zonePickId, setZonePickId] = useState('');

  const cardDef = prompt.cardName ? CardRegistry.getByName(prompt.cardName) : undefined;
  const targetMin = cardDef?.targeting.count?.min ?? 1;
  const targetMax = cardDef?.targeting.count?.max ?? 1;
  const singleTarget = targetMax <= 1;

  useEffect(() => {
    setSelectedTargets([]);
    setRendeTarget('');
    setRendeCardIndices([]);
    setZhihengCardIndices([]);
    setModifyJudgeIndex(null);
    setDiscardIndices([]);
    setZonePickId('');
  }, [prompt.id]);

  const sourcePlayer = room.players.find((p) => p.id === prompt.sourcePlayerId);
  const promptActor = room.players.find((p) => p.id === prompt.playerId);
  const judgeTarget = prompt.judgeTargetId
    ? room.players.find((p) => p.id === prompt.judgeTargetId)
    : undefined;
  const turnPhase = room.sandbox?.turnPhase;

  const validTargets = (prompt.validTargetIds ?? [])
    .map((id) => room.players.find((p) => p.id === id))
    .filter((p): p is RoomPlayer => !!p);

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) => {
      if (singleTarget) return prev[0] === id ? [] : [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= targetMax) return prev;
      return [...prev, id];
    });
  };

  const canConfirmTargets =
    selectedTargets.length >= targetMin && selectedTargets.length <= targetMax;

  const isGiveCardsSkill =
    prompt.type === 'use_skill' &&
    !!prompt.skillId &&
    validTargets.length > 0 &&
    (prompt.options?.some((o) => o.id.endsWith(':finish')) ?? false);

  const isZhiheng = prompt.type === 'use_skill' && prompt.skillId === 'zhiheng';

  const isModifyJudge = prompt.type === 'modify_judge';

  const isDiscard = prompt.type === 'discard_cards';
  const isZonePick = prompt.type === 'select_zone_card';
  const discardNeed = prompt.discardCount ?? 0;
  const handForDiscard = actingPlayer?.handCards ?? [];

  const toggleRendeCard = (index: number) => {
    setRendeCardIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const toggleZhihengCard = (index: number) => {
    setZhihengCardIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const toggleDiscardCard = (index: number) => {
    setDiscardIndices((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= discardNeed) return prev;
      return [...prev, index];
    });
  };

  const rendeHand = actingPlayer?.handCards ?? [];
  const zhihengHand = actingPlayer?.handCards ?? [];
  const modifyHand = promptActor?.handCards ?? [];

  const showSkills =
    prompt.characterSkills &&
    prompt.characterSkills.length > 0 &&
    (prompt.type === 'play_card_confirm' ||
      prompt.type === 'use_skill' ||
      prompt.type === 'modify_judge');

  const zonePickTarget = (prompt.targetPlayerIds ?? [])[0]
    ? room.players.find((p) => p.id === prompt.targetPlayerIds![0])
    : undefined;

  const title =
    prompt.type === 'response'
      ? '响应'
      : prompt.type === 'select_targets'
        ? '选择目标'
        : prompt.type === 'select_zone_card'
          ? '选择区域牌'
        : prompt.type === 'discard_cards'
          ? '弃牌阶段'
          : prompt.type === 'modify_judge'
            ? '改判'
            : isGiveCardsSkill
              ? prompt.skillName ?? '给予手牌'
              : isZhiheng
                ? '制衡'
                : prompt.type === 'use_skill'
                  ? '发动技能'
                  : '出牌确认';

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.panelWide} role="dialog">
        <header className={styles.header}>
          <h2>{title}</h2>
          {turnPhase && (
            <span className={styles.phaseTag}>{PHASE_LABEL[turnPhase] ?? turnPhase}</span>
          )}
        </header>
        <div className={styles.body}>
          <p className={styles.message}>{prompt.message}</p>

          {actingPlayer && (
            <section className={styles.section}>
              <h3>当前操控</h3>
              <p>
                {actingPlayer.nickname}（{actingPlayer.general ?? '—'}）【{actingPlayer.role}】
                {actingPlayer.hp}/{actingPlayer.maxHp}
              </p>
            </section>
          )}

          {showSkills && prompt.characterSkills && (
            <SkillListSection skills={prompt.characterSkills} />
          )}

          {isModifyJudge && (
            <section className={styles.section}>
              <h3>判定信息</h3>
              <p>
                被判定：{judgeTarget?.general ?? '—'} · 【{prompt.judgeCardName}】
              </p>
              <p>当前判定结果：{prompt.judgeResult}</p>
              <p className={styles.muted}>选择一张手牌打出代替判定结果：</p>
              <ul className={styles.cardPickList}>
                {modifyHand.map((c, i) => (
                  <li key={`${c}-${i}`}>
                    <label className={styles.targetOption}>
                      <input
                        type="radio"
                        name="modify-judge-card"
                        checked={modifyJudgeIndex === i}
                        onChange={() => setModifyJudgeIndex(i)}
                      />
                      <span>【{c}】</span>
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
                    if (modifyJudgeIndex != null) {
                      onModifyJudge(prompt.id, modifyJudgeIndex);
                    }
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
                {promptActor.general} — 手牌 {promptActor.handCards?.length ?? 0} 张
              </p>
            </section>
          )}

          {cardDef && (
            <section className={styles.section}>
              <h3>卡牌说明 ·【{cardDef.name}】</h3>
              <p>{cardDef.description}</p>
              <p className={styles.muted}>类型：{cardDef.type}</p>
            </section>
          )}

          {sourcePlayer && prompt.type === 'response' && (
            <section className={styles.section}>
              <h3>来源</h3>
              <p>{sourcePlayer.general} 对你使用了【{prompt.cardName}】</p>
            </section>
          )}

          {prompt.type === 'select_targets' && (
            <section className={styles.section}>
              <h3>选择使用目标</h3>
              {validTargets.length === 0 ? (
                <p className={styles.muted}>当前没有可选目标（请检查攻击距离或存活角色）</p>
              ) : (
                <ul className={styles.targetList}>
                  {validTargets.map((t) => (
                    <li key={t.id}>
                      <label className={styles.targetOption}>
                        <input
                          type={singleTarget ? 'radio' : 'checkbox'}
                          name="play-target"
                          checked={selectedTargets.includes(t.id)}
                          onChange={() => toggleTarget(t.id)}
                        />
                        <span>
                          {t.general ?? t.nickname}（{t.hp}/{t.maxHp}）【{t.role}】
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={styles.primary}
                disabled={!canConfirmTargets}
                onClick={() => onSelectTargets(prompt.id, selectedTargets)}
              >
                确认目标
                {targetMin > 1 || targetMax > 1
                  ? `（${selectedTargets.length}/${targetMax}）`
                  : ''}
              </button>
            </section>
          )}

          {isGiveCardsSkill && (
            <section className={styles.section}>
              <h3>【仁德】给牌（可多选）</h3>
              <label className={styles.fieldLabel}>
                目标角色
                <select
                  className={styles.select}
                  value={rendeTarget}
                  onChange={(e) => setRendeTarget(e.target.value)}
                >
                  <option value="">选择目标</option>
                  {validTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.general ?? t.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.muted}>勾选要给出的手牌（可多张）：</p>
              <ul className={styles.cardPickList}>
                {rendeHand.map((c, i) => (
                  <li key={`${c}-${i}`}>
                    <label className={styles.targetOption}>
                      <input
                        type="checkbox"
                        checked={rendeCardIndices.includes(i)}
                        onChange={() => toggleRendeCard(i)}
                      />
                      <span>{c}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!rendeTarget || rendeCardIndices.length === 0}
                  onClick={() => {
                    const cards = rendeCardIndices.map((i) => rendeHand[i]!);
                    onRendeGive(rendeTarget, cards, rendeCardIndices);
                    setRendeCardIndices([]);
                  }}
                >
                  给予手牌（{rendeCardIndices.length} 张）
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onRendeFinish()}
                >
                  {prompt.options?.find((o) => o.id.endsWith(':finish'))?.label ?? '完成'}
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
              <h3>【制衡】弃置手牌（可多选，至少一张）</h3>
              <p className={styles.muted}>
                已选 {zhihengCardIndices.length} 张，弃置后摸等量牌
              </p>
              <ul className={styles.cardPickList}>
                {zhihengHand.map((c, i) => (
                  <li key={`${c}-${i}`}>
                    <label className={styles.targetOption}>
                      <input
                        type="checkbox"
                        checked={zhihengCardIndices.includes(i)}
                        onChange={() => toggleZhihengCard(i)}
                      />
                      <span>【{c}】</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={zhihengCardIndices.length === 0}
                  onClick={() => onZhihengConfirm(zhihengCardIndices)}
                >
                  确认制衡（弃 {zhihengCardIndices.length} 张）
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

          {isDiscard && (
            <section className={styles.section}>
              <h3>选择弃置的手牌</h3>
              <p className={styles.muted}>
                须弃置 {discardNeed} 张（已选 {discardIndices.length}/{discardNeed}）
              </p>
              <ul className={styles.cardPickList}>
                {handForDiscard.map((c, i) => (
                  <li key={`${c}-${i}`}>
                    <label className={styles.targetOption}>
                      <input
                        type="checkbox"
                        checked={discardIndices.includes(i)}
                        onChange={() => toggleDiscardCard(i)}
                      />
                      <span>【{c}】</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={styles.primary}
                disabled={discardIndices.length !== discardNeed}
                onClick={() => onDiscardCards(prompt.id, discardIndices)}
              >
                确认弃牌
              </button>
            </section>
          )}

          {isZonePick && (
            <section className={styles.section}>
              <h3>选择目标区域内的一张牌</h3>
              {zonePickTarget && (
                <p className={styles.muted}>
                  目标：{zonePickTarget.general ?? zonePickTarget.nickname}（手牌{' '}
                  {zonePickTarget.handCards?.length ?? 0} 张，装备{' '}
                  {zonePickTarget.equipment?.length ?? 0} 件）
                </p>
              )}
              <ul className={styles.cardPickList}>
                {(prompt.zoneCardOptions ?? []).map((opt) => (
                  <li key={opt.id}>
                    <label className={styles.targetOption}>
                      <input
                        type="radio"
                        name="zone-pick-card"
                        checked={zonePickId === opt.id}
                        onChange={() => setZonePickId(opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
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
              {prompt.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={opt.id === 'pass' || opt.id === 'cancel' ? styles.secondary : styles.primary}
                  onClick={() => {
                    if (prompt.type === 'response') {
                      onSubmitResponse(prompt.id, opt.id);
                    } else {
                      onConfirmPlay(prompt.id, opt.id);
                    }
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
