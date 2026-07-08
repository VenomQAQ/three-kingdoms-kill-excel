import { CardRegistry, isInAttackRange, playerHasWeapon } from '@tk/engine';
import type { EnginePlayerState } from '@tk/engine';
import type { GamePrompt, PromptSkillInfo, Room, RoomPlayer } from '@tk/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  formatGeneralName,
  formatCardTypeLabel,
  formatHandCardLabel,
  formatPlayCardButtonLabel,
  stripGeneralPrefixInText,
  toChineseCount,
} from '../../utils/display';
import styles from './GameModal.module.css';

interface GamePromptModalProps {
  room: Room;
  prompt: GamePrompt;
  actingPlayer: RoomPlayer | undefined;
  onConfirmPlay: (promptId: string, choiceId: string) => void;
  onSelectTargets: (promptId: string, targetIds: string[], zoneCardId?: string) => void;
  onSubmitResponse: (promptId: string, choiceId: string) => void;
  onRendeGive: (targetId: string, cards: string[], handIndices: number[]) => void;
  onQingnangRecover: (targetId: string, handIndices: number[]) => void;
  onZhihengConfirm: (handIndices: number[]) => void;
  onModifyJudge: (promptId: string, handIndex: number, handCardEntry?: string) => void;
  onSkipModifyJudge: (promptId: string) => void;
  onDiscardCards: (promptId: string, handIndices: number[]) => void;
  onSelectZoneCard: (promptId: string, choiceId: string) => void;
  onClose?: () => void;
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

function judgeCardRule(cardName?: string): string {
  switch (stripGeneralPrefixInText(cardName ?? '')) {
    case '乐不思蜀':
      return '判定结果为红桃时不生效，可正常出牌；否则跳过出牌阶段。';
    case '兵粮寸断':
      return '判定结果为梅花时不生效，可正常摸牌；否则跳过摸牌阶段。';
    case '闪电':
      return '判定结果为黑桃 2～9 时生效，受到 3 点雷电伤害；否则移入下一名角色判定区。';
    default:
      return '按该锦囊的判定说明结算。';
  }
}

function asEnginePlayer(player: RoomPlayer): EnginePlayerState {
  return {
    id: player.id,
    seat: player.seat ?? 0,
    nickname: player.nickname,
    generalId: player.general ?? player.id,
    generalName: player.general ?? player.nickname,
    role: player.role ?? '反贼',
    roleRevealed: player.roleRevealed,
    kingdom: 'shu',
    hp: player.hp ?? 4,
    maxHp: player.maxHp ?? 4,
    handCards: player.handCards ?? [],
    equipment: player.equipment ?? [],
    judgeCards: player.judgeCards ?? [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
    dead: player.dead,
  };
}

function isAlivePlayer(player: RoomPlayer): boolean {
  return !player.dead && (player.hp ?? 0) > 0;
}

function CardPickChips({
  cards,
  selectedIndices,
  allowedIndices,
  onToggle,
}: {
  cards: string[];
  selectedIndices: number[];
  allowedIndices?: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className={styles.cardChipList}>
      {cards.map((card, index) => {
        const active = selectedIndices.includes(index);
        const disabled = allowedIndices !== undefined && !allowedIndices.includes(index);
        return (
          <button
            key={`${card}-${index}`}
            type="button"
            className={`${styles.cardChip} ${active ? styles.cardChipActive : ''}`}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onToggle(index);
            }}
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
  onQingnangRecover,
  onZhihengConfirm,
  onModifyJudge,
  onSkipModifyJudge,
  onDiscardCards,
  onSelectZoneCard,
  onClose,
}: GamePromptModalProps) {
  const [jiedaoHolderId, setJiedaoHolderId] = useState('');
  const [jiedaoVictimId, setJiedaoVictimId] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [rendeTarget, setRendeTarget] = useState('');
  const [rendeCardIndices, setRendeCardIndices] = useState<number[]>([]);
  const [zhihengCardIndices, setZhihengCardIndices] = useState<number[]>([]);
  const [modifyJudgeIndex, setModifyJudgeIndex] = useState<number | null>(null);
  const [discardIndices, setDiscardIndices] = useState<number[]>([]);
  const [zonePickId, setZonePickId] = useState('');
  const [skillZoneCardId, setSkillZoneCardId] = useState('');
  const [guanxingOrder, setGuanxingOrder] = useState<number[]>([]);
  const [guanxingTopCount, setGuanxingTopCount] = useState(0);
  const [draggedGuanxingPosition, setDraggedGuanxingPosition] = useState<number | null>(null);

  useEffect(() => {
    setSelectedTargets([]);
    setJiedaoHolderId('');
    setJiedaoVictimId('');
    setRendeTarget('');
    setRendeCardIndices([]);
    setZhihengCardIndices([]);
    setModifyJudgeIndex(null);
    setDiscardIndices([]);
    setZonePickId('');
    setSkillZoneCardId('');
    setDraggedGuanxingPosition(null);
    const guanxingCards = prompt.guanxingCards ?? [];
    setGuanxingOrder(guanxingCards.map((_, index) => index));
    setGuanxingTopCount(guanxingCards.length);
  }, [prompt.id]);

  const cardDef = prompt.cardName
    ? CardRegistry.getByName(prompt.cardName)
    : prompt.cardId
      ? CardRegistry.getById(prompt.cardId)
      : undefined;
  const isJiedao =
    prompt.type === 'select_targets' &&
    (prompt.cardId === 'jiedao_sharen' || cardDef?.id === 'jiedao_sharen');
  const targetMin = cardDef?.targeting.count?.min ?? 1;
  const targetMax = cardDef?.targeting.count?.max ?? 1;
  const singleTarget = targetMax <= 1;
  const sourcePlayer = room.players.find((player) => player.id === prompt.sourcePlayerId);
  const promptActor = room.players.find((player) => player.id === prompt.playerId);
  const dyingPlayer = prompt.dyingPlayerId
    ? room.players.find((player) => player.id === prompt.dyingPlayerId)
    : undefined;
  const judgeTarget = prompt.judgeTargetId
    ? room.players.find((player) => player.id === prompt.judgeTargetId)
    : undefined;
  const turnPhase = room.sandbox?.turnPhase;
  const enginePlayers = useMemo(
    () => room.players.map(asEnginePlayer),
    [room.players],
  );
  const jiedaoSourceId = prompt.playerId;
  const jiedaoHolderCandidates = useMemo(
    () =>
      room.players.filter(
        (player) =>
          isAlivePlayer(player) &&
          player.id !== jiedaoSourceId &&
          playerHasWeapon(asEnginePlayer(player)),
      ),
    [room.players, jiedaoSourceId],
  );
  const jiedaoHolder = jiedaoHolderCandidates.find((player) => player.id === jiedaoHolderId);
  const jiedaoVictimCandidates = useMemo(() => {
    if (!jiedaoHolder) return [];
    const holderState = asEnginePlayer(jiedaoHolder);
    return room.players.filter(
      (player) =>
        isAlivePlayer(player) &&
        player.id !== jiedaoSourceId &&
        player.id !== jiedaoHolder.id &&
        isInAttackRange(enginePlayers, holderState, asEnginePlayer(player)),
    );
  }, [enginePlayers, jiedaoHolder, jiedaoSourceId, room.players]);
  const noJiedaoHolders = isJiedao && jiedaoHolderCandidates.length === 0;
  const validTargets = (prompt.validTargetIds ?? [])
    .map((id) => room.players.find((player) => player.id === id))
    .filter((player): player is RoomPlayer => !!player);

  const isGiveCardsSkill =
    prompt.type === 'use_skill' &&
    !!prompt.skillId &&
    Array.isArray(prompt.validTargetIds) &&
    prompt.skillAction !== 'discard_recover' &&
    prompt.skillAction !== 'discard_draw' &&
    prompt.skillAction !== 'virtual_basic' &&
    prompt.skillAction !== 'discard_card_target_pair' &&
    prompt.skillAction !== 'give_card_duel_target' &&
    prompt.skillAction !== 'discard_red_then_choose' &&
    prompt.skillAction !== 'pindian' &&
    prompt.skillAction !== 'recover_choice' &&
    prompt.skillId !== 'jianyan';
  const isDiscardRecoverSkill =
    prompt.type === 'use_skill' && prompt.skillAction === 'discard_recover';
  const isDiscardDrawSkill = prompt.type === 'use_skill' && prompt.skillAction === 'discard_draw';
  const isDiscardRedThenChoose =
    prompt.type === 'use_skill' && prompt.skillAction === 'discard_red_then_choose';
  const isVirtualCardPick =
    prompt.type === 'use_skill' && prompt.skillAction === 'virtual_card_pick';
  const isLijian = prompt.type === 'use_skill' && prompt.skillId === 'lijian';
  const isJianyan = prompt.type === 'use_skill' && prompt.skillId === 'jianyan';
  const isLiuli = prompt.type === 'use_skill' && prompt.skillId === 'liuli';
  const isShaDodgedEquipment =
    prompt.type === 'use_skill' && prompt.skillId === 'sha_dodged_equipment';
  const isFanjian = prompt.type === 'use_skill' && prompt.skillId === 'fanjian';
  const isLiyu = prompt.type === 'use_skill' && prompt.skillId === 'liyu';
  const isYiji = prompt.type === 'use_skill' && prompt.skillId === 'yiji';
  const isZhiheng = prompt.type === 'use_skill' && prompt.skillId === 'zhiheng';
  const isYijuePindian = prompt.type === 'use_skill' && prompt.skillAction === 'pindian';
  const isYijueRecover = prompt.type === 'use_skill' && prompt.skillAction === 'recover_choice';
  const isGuanxing =
    prompt.type === 'use_skill' &&
    (prompt.skillId === 'guanxing' || prompt.skillId === 'xunxun');
  const isXunxun = prompt.type === 'use_skill' && prompt.skillId === 'xunxun';
  const isModifyJudge = prompt.type === 'modify_judge';
  const isDiscard = prompt.type === 'discard_cards';
  const isZonePick = prompt.type === 'select_zone_card';
  const isWuxieResponse =
    prompt.type === 'response' &&
    prompt.validResponseCards?.includes('无懈可击') === true &&
    !!sourcePlayer &&
    (prompt.targetPlayerIds?.length ?? 0) > 0;
  const hasResponseContext =
    prompt.type === 'response' &&
    !!sourcePlayer &&
    !!prompt.cardName &&
    (prompt.targetPlayerIds?.length ?? 0) > 0;
  const hasDyingRescueContext =
    prompt.type === 'dying_rescue' && !!dyingPlayer && !!promptActor;
  const isSelfDyingRescue =
    hasDyingRescueContext && dyingPlayer!.id === promptActor!.id;
  const dyingRescueHint = useMemo(() => {
    if (!hasDyingRescueContext || !dyingPlayer || !promptActor) return '';
    if (isSelfDyingRescue) {
      return `轮到你（${formatGeneralName(promptActor)}）决定是否使用【桃】或【酒】自救`;
    }
    if (prompt.message?.includes('【救援】')) {
      return `轮到你（${formatGeneralName(promptActor)}）响应【救援】，替 ${formatGeneralName(dyingPlayer)} 打出【桃】`;
    }
    return `轮到你（${formatGeneralName(promptActor)}）决定是否对 ${formatGeneralName(dyingPlayer)} 使用【桃】救助`;
  }, [
    dyingPlayer,
    hasDyingRescueContext,
    isSelfDyingRescue,
    prompt.message,
    promptActor,
  ]);
  const discardNeed = prompt.discardCount ?? 0;
  const discardRecoverNeed = Math.max(1, prompt.discardCount ?? 1);
  const noLegalTargets =
    (prompt.type === 'select_targets' ||
      (prompt.type === 'use_skill' && Array.isArray(prompt.validTargetIds))) &&
    !isJiedao &&
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
      if (isWuxieResponse) return '是否使用【无懈可击】？';
      if (prompt.cardName) {
        return `响应【${stripGeneralPrefixInText(prompt.cardName)}】`;
      }
      return '请进行响应';
    }
    if (prompt.type === 'pick_revealed') {
      return '五谷丰登 · 选牌';
    }
    if (prompt.type === 'dying_rescue') {
      if (prompt.dyingPlayerId && prompt.dyingPlayerId === prompt.playerId) {
        return '濒死自救';
      }
      return '濒死救助';
    }
    if (isLiuli) {
      return '发动【流离】';
    }
    if (isFanjian) {
      return prompt.sourcePlayerId ? '响应【反间】' : '发动【反间】';
    }
    if (isLiyu) {
      return '发动【利驭】';
    }
    if (isGiveCardsSkill) {
      return `请选择【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】目标`;
    }
    if (isDiscardRecoverSkill) {
      return `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】`;
    }
    if (isZhiheng) {
      return `弃置手牌（${zhihengCardIndices.length}）`;
    }
    if (isDiscardDrawSkill) {
      return `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】`;
    }
    if (isDiscardRedThenChoose) {
      return `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】`;
    }
    if (isVirtualCardPick) {
      return prompt.cardName
        ? `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】·当【${stripGeneralPrefixInText(prompt.cardName)}】`
        : `发动【${stripGeneralPrefixInText(prompt.skillName ?? '技能')}】`;
    }
    if (isYijuePindian || isYijueRecover) {
      return '发动【义绝】';
    }
    if (prompt.type === 'use_skill') {
      const skillLabel = stripGeneralPrefixInText(prompt.skillName ?? '');
      if (skillLabel) return `发动【${skillLabel}】`;
      return prompt.message || '是否发动技能？';
    }
    return '确认动作';
  }, [
    discardIndices.length,
    discardNeed,
    isGiveCardsSkill,
    isDiscardRecoverSkill,
    isDiscardDrawSkill,
    isDiscardRedThenChoose,
    isVirtualCardPick,
    isFanjian,
    isLiyu,
    isLiuli,
    isYijuePindian,
    isYijueRecover,
    isZhiheng,
    isWuxieResponse,
    prompt.cardName,
    prompt.dyingPlayerId,
    prompt.playerId,
    prompt.skillName,
    prompt.type,
    zhihengCardIndices.length,
  ]);

  const showSkills =
    prompt.characterSkills &&
    prompt.characterSkills.length > 0 &&
    (prompt.type === 'play_card_confirm' || prompt.type === 'use_skill');

  const rendeHand = actingPlayer?.handCards ?? [];
  const discardRecoverHand = actingPlayer?.handCards ?? [];
  const discardDrawHand = actingPlayer?.handCards ?? [];
  const discardRedHand = actingPlayer?.handCards ?? [];
  const virtualCardPickHand = actingPlayer?.handCards ?? [];
  const yijueSourceHand = actingPlayer?.handCards ?? [];
  const yijueTarget = validTargets.find((target) => target.id === rendeTarget);
  const yijueTargetHand = yijueTarget?.handCards ?? [];
  const lijianCardOptions = prompt.skillCardOptions ?? [];
  const lijianTargetOptions = validTargets.filter((target) => target.id !== rendeTarget);
  const liyuCardOptions = prompt.skillCardOptions ?? [];
  const zhihengHand = actingPlayer?.handCards ?? [];
  const modifyHand = prompt.modifyHandCards ?? promptActor?.handCards ?? [];
  const handForDiscard = actingPlayer?.handCards ?? [];
  const zonePickTarget = (prompt.targetPlayerIds ?? [])[0]
    ? room.players.find((player) => player.id === prompt.targetPlayerIds![0])
    : undefined;
  const wuxieTargetNames = (prompt.targetPlayerIds ?? [])
    .map((id) => room.players.find((player) => player.id === id))
    .filter((player): player is RoomPlayer => !!player)
    .map((player) => formatGeneralName(player));

  const formatResponseOptionLabel = (optionId: string, optionLabel: string): string => {
    if (optionId.startsWith('lord:card:')) {
      return formatPlayCardButtonLabel(optionId.slice('lord:card:'.length));
    }
    if (optionId.startsWith('card:')) {
      return formatPlayCardButtonLabel(optionId.slice('card:'.length));
    }
    if (!isWuxieResponse) return optionLabel;
    if (optionId === 'pass') return '不出【无懈可击】';
    if (optionId === 'wuxie:all') {
      return `为 ${wuxieTargetNames.join('、')} 抵消【${stripGeneralPrefixInText(prompt.cardName ?? '锦囊')}】`;
    }
    if (optionId.startsWith('wuxie:')) {
      const targetId = optionId.slice('wuxie:'.length);
      const target = room.players.find((player) => player.id === targetId);
      const targetName = target ? formatGeneralName(target) : '目标';
      return `为 ${targetName} 抵消【${stripGeneralPrefixInText(prompt.cardName ?? '锦囊')}】`;
    }
    return optionLabel;
  };
  const guanxingCards = prompt.guanxingCards ?? [];
  const orderedGuanxingCards = guanxingOrder.map((index) => guanxingCards[index]).filter(Boolean);
  const skillCardOptions = prompt.skillCardOptions ?? [];

  const moveGuanxingCard = (fromPosition: number, toPosition: number) => {
    setGuanxingOrder((previous) => {
      if (
        fromPosition === toPosition ||
        fromPosition < 0 ||
        fromPosition >= previous.length ||
        toPosition < 0 ||
        toPosition >= previous.length
      ) {
        return previous;
      }
      const next = [...previous];
      const [item] = next.splice(fromPosition, 1);
      if (item == null) return previous;
      next.splice(toPosition, 0, item);
      return next;
    });
  };

  const handleGuanxingDragStart = (position: number) => {
    setDraggedGuanxingPosition(position);
  };

  const handleGuanxingDragEnter = (position: number) => {
    if (draggedGuanxingPosition == null || draggedGuanxingPosition === position) return;
    moveGuanxingCard(draggedGuanxingPosition, position);
    setDraggedGuanxingPosition(position);
  };

  const handleGuanxingDragEnd = () => {
    setDraggedGuanxingPosition(null);
  };

  const toggleTarget = (id: string) => {
    setZonePickId('');
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

  const toggleSkillZoneCard = (id: string) => {
    setRendeCardIndices((previous) => {
      const current = prompt.skillCardOptions?.findIndex((option) => option.id === id) ?? -1;
      if (previous.includes(current)) return previous.filter((value) => value !== current);
      if (previous.length >= discardNeed) return previous;
      return current >= 0 ? [...previous, current] : previous;
    });
  };

  const canConfirmTargets =
    selectedTargets.length >= targetMin && selectedTargets.length <= targetMax;
  const zonePickHandCount =
    zonePickTarget?.handCards?.length ||
    zonePickTarget?.handCount ||
    prompt.zoneCardOptions?.filter((option) => option.id.startsWith('hand:')).length ||
    0;

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
          {hasDyingRescueContext && dyingPlayer && promptActor && (
            <section className={styles.section}>
              <h3>濒死局面</h3>
              <div className={styles.playChainBox}>
                <p className={styles.playChainLine}>
                  <span className={styles.playChainActor}>{formatGeneralName(dyingPlayer)}</span>
                  {' 体力 '}
                  {dyingPlayer.hp ?? 0}/{dyingPlayer.maxHp ?? 0}
                  {'，濒临死亡'}
                </p>
                <p className={styles.playChainHint}>
                  {dyingRescueHint}
                  {' · 手牌 '}
                  {promptActor.handCards?.length ?? 0}
                  {' 张'}
                </p>
              </div>
            </section>
          )}

          {hasResponseContext && sourcePlayer && (
            <section className={styles.section}>
              <h3>{isWuxieResponse ? '锦囊结算' : '当前局面'}</h3>
              <div className={styles.playChainBox}>
                <p className={styles.playChainLine}>
                  <span className={styles.playChainActor}>{formatGeneralName(sourcePlayer)}</span>
                  {' 对 '}
                  <span className={styles.playChainTarget}>{wuxieTargetNames.join('、')}</span>
                  {' 使用了 '}
                  <span className={styles.playChainCard}>
                    【{stripGeneralPrefixInText(prompt.cardName ?? '')}】
                  </span>
                </p>
                {isWuxieResponse ? (
                  <p className={styles.playChainHint}>
                    轮到你（{formatGeneralName(promptActor)}）决定是否打出【无懈可击】抵消该锦囊
                    {promptActor ? ` · 手牌 ${promptActor.handCards?.length ?? 0} 张` : ''}。
                  </p>
                ) : promptActor ? (
                  <p className={styles.playChainHint}>
                    {stripGeneralPrefixInText(prompt.message) ||
                      `轮到你（${formatGeneralName(promptActor)}）响应`}
                    {' · 手牌 '}
                    {promptActor.handCards?.length ?? 0}
                    {' 张'}
                  </p>
                ) : prompt.message ? (
                  <p className={styles.playChainHint}>{stripGeneralPrefixInText(prompt.message)}</p>
                ) : null}
              </div>
            </section>
          )}

          {actingPlayer &&
            prompt.type !== 'response' &&
            prompt.type !== 'dying_rescue' &&
            !isModifyJudge &&
            !isWuxieResponse && (
            <section className={styles.section}>
              {/* <h3>当前操控</h3>
              <p className={styles.inlineMeta}>
                【{actingPlayer.role ?? '未知'}】{formatGeneralName(actingPlayer)} 体力:
                {actingPlayer.hp ?? 0} 手牌:{actingPlayer.handCards?.length ?? 0}
              </p> */}
              <h3>当前操控：{formatGeneralName(actingPlayer)}</h3>
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

          {noJiedaoHolders && (
            <section className={styles.section}>
              <p className={styles.notice}>当前没有其他角色装备武器，无法使用【借刀杀人】。</p>
            </section>
          )}

          {isModifyJudge && (
            <section className={styles.section}>
              <h3>判定信息</h3>
              <dl className={styles.meta}>
                <dt>被判定人</dt>
                <dd>{formatGeneralName(judgeTarget) || '—'}</dd>
                <dt>触发锦囊</dt>
                <dd>【{stripGeneralPrefixInText(prompt.judgeCardName ?? '未知')}】</dd>
                <dt>判定规则</dt>
                <dd>{judgeCardRule(prompt.judgeCardName)}</dd>
                <dt>当前判定牌</dt>
                <dd>
                  {prompt.judgeResult
                    ? formatHandCardLabel(prompt.judgeResult)
                    : '尚未翻开'}
                </dd>
              </dl>
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
                      <span>{formatHandCardLabel(card)}</span>
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
                      const handCardEntry = modifyHand[modifyJudgeIndex];
                      onModifyJudge(prompt.id, modifyJudgeIndex, handCardEntry);
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

          {promptActor &&
            (prompt.type === 'response' || prompt.type === 'dying_rescue') &&
            !isWuxieResponse &&
            !hasResponseContext &&
            !hasDyingRescueContext && (
            <section className={styles.section}>
              <h3>{prompt.type === 'dying_rescue' ? '询问角色' : '响应角色'}</h3>
              <p>
                {formatGeneralName(promptActor)} · 手牌 {promptActor.handCards?.length ?? 0} 张
              </p>
            </section>
          )}

          {cardDef && !isWuxieResponse && (
            <section className={styles.section}>
              <h3>卡牌说明 · 【{stripGeneralPrefixInText(cardDef.name)}】</h3>
              <p>{stripGeneralPrefixInText(cardDef.description)}</p>
              <p className={styles.muted}>
                类型：{formatCardTypeLabel(cardDef.type, cardDef.subType)}
              </p>
            </section>
          )}

          {isJiedao && (
            <section className={styles.section}>
              <h3>选择借刀对象与杀的目标</h3>
              {!noJiedaoHolders && (
                <>
                  <label className={styles.fieldLabel}>
                    有武器的角色
                    <select
                      className={styles.select}
                      value={jiedaoHolderId}
                      onChange={(event) => {
                        setJiedaoHolderId(event.target.value);
                        setJiedaoVictimId('');
                      }}
                    >
                      <option value="">请选择持刀角色</option>
                      {jiedaoHolderCandidates.map((target) => (
                        <option key={target.id} value={target.id}>
                          {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                          {target.equipment?.length ? ` · 装备:${target.equipment.join('、')}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fieldLabel}>
                    杀的目标
                    <select
                      className={styles.select}
                      value={jiedaoVictimId}
                      onChange={(event) => setJiedaoVictimId(event.target.value)}
                      disabled={!jiedaoHolderId}
                    >
                      <option value="">
                        {jiedaoHolderId ? '请选择被杀目标' : '请先选择持刀角色'}
                      </option>
                      {jiedaoVictimCandidates.map((target) => (
                        <option key={target.id} value={target.id}>
                          {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                        </option>
                      ))}
                    </select>
                  </label>
                  {jiedaoHolderId && jiedaoVictimCandidates.length === 0 ? (
                    <p className={styles.notice}>该角色攻击范围内没有其他可指定目标。</p>
                  ) : null}
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={noJiedaoHolders || !jiedaoHolderId || !jiedaoVictimId}
                  onClick={() =>
                    onSelectTargets(prompt.id, [jiedaoHolderId, jiedaoVictimId])
                  }
                >
                  确认目标
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

          {prompt.type === 'select_targets' && !isJiedao && (
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
                          {formatGeneralName(target)} 体力:{target.hp ?? 0}/
                          {target.maxHp ?? 0}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={noLegalTargets || !canConfirmTargets}
                  onClick={() =>
                    onSelectTargets(
                      prompt.id,
                      selectedTargets,
                    )
                  }
                >
                  确认目标
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

          {isGiveCardsSkill && (
            <section className={styles.section}>
              <h3>{isYiji ? '分配手牌' : '给出手牌'}</h3>
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
                          {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                      </option>
                    ))}
                  </select>
                  </label>
                  <p className={styles.muted}>
                    {isYiji
                      ? `选择至多 ${Math.max(0, prompt.discardCount ?? 2)} 张手牌分配：`
                      : '下面是卡牌列表：'}
                  </p>
                  <CardPickChips
                    cards={rendeHand}
                    selectedIndices={rendeCardIndices}
                    onToggle={(index) => {
                      if (!isYiji) {
                        toggleRendeCard(index);
                        return;
                      }
                      setRendeCardIndices((previous) => {
                        if (previous.includes(index)) {
                          return previous.filter((value) => value !== index);
                        }
                        const max = Math.max(0, prompt.discardCount ?? 2);
                        if (previous.length >= max) return previous;
                        return [...previous, index];
                      });
                    }}
                  />
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    noLegalTargets ||
                    !rendeTarget ||
                    rendeCardIndices.length === 0 ||
                    (isYiji && rendeCardIndices.length > Math.max(0, prompt.discardCount ?? 2))
                  }
                  onClick={() => {
                    const cards = rendeCardIndices.map((index) => rendeHand[index]!);
                    onRendeGive(rendeTarget, cards, rendeCardIndices);
                    setRendeCardIndices([]);
                  }}
                >
                  {isYiji ? '分配手牌' : '给出手牌'}（{rendeCardIndices.length}）
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, isYiji ? 'yiji:finish' : 'cancel')}
                >
                  {isYiji ? '完成' : '取消'}
                </button>
              </div>
            </section>
          )}

          {isDiscardRecoverSkill && (
            <section className={styles.section}>
              <h3>弃置手牌并回复体力</h3>
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
                          {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.muted}>选择 {discardRecoverNeed} 张手牌弃置：</p>
                  <CardPickChips
                    cards={discardRecoverHand}
                    selectedIndices={discardIndices}
                    onToggle={(index) => {
                      setDiscardIndices((previous) => {
                        if (previous.includes(index)) {
                          return previous.filter((value) => value !== index);
                        }
                        if (previous.length >= discardRecoverNeed) return previous;
                        return [...previous, index];
                      });
                    }}
                  />
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    noLegalTargets || !rendeTarget || discardIndices.length !== discardRecoverNeed
                  }
                  onClick={() => {
                    if (discardIndices.length === discardRecoverNeed) {
                      onQingnangRecover(rendeTarget, discardIndices);
                    }
                  }}
                >
                  确认回复
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

          {isJianyan && (
            <section className={styles.section}>
              <h3>声明并选择目标</h3>
              {!noLegalTargets && (
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
                        {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className={styles.actions}>
                {(prompt.options ?? []).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.id === 'cancel' ? styles.secondary : styles.primary}
                    disabled={option.id !== 'cancel' && (noLegalTargets || !rendeTarget)}
                    onClick={() =>
                      onConfirmPlay(
                        prompt.id,
                        option.id === 'cancel' ? option.id : `${option.id}:${rendeTarget}`,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {isLiuli && (
            <section className={styles.section}>
              <h3>转移【杀】</h3>
              {!noLegalTargets && (
                <label className={styles.fieldLabel}>
                  转移目标
                  <select
                    className={styles.select}
                    value={rendeTarget}
                    onChange={(event) => setRendeTarget(event.target.value)}
                  >
                    <option value="">请选择目标角色</option>
                    {validTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {skillCardOptions.length > 0 ? (
                <>
                  <p className={styles.muted}>选择一张手牌或装备弃置：</p>
                  <ul className={styles.cardPickList}>
                    {skillCardOptions.map((option) => (
                      <li key={option.id}>
                        <label className={styles.targetOption}>
                          <input
                            type="radio"
                            name="liuli-card"
                            checked={zonePickId === option.id}
                            onChange={() => setZonePickId(option.id)}
                          />
                          <span>{option.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={styles.notice}>当前没有可弃置的牌。</p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={noLegalTargets || !rendeTarget || !zonePickId}
                  onClick={() => onConfirmPlay(prompt.id, `liuli:confirm:${rendeTarget}:${zonePickId}`)}
                >
                  确认流离
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'skip')}
                >
                  不发动
                </button>
              </div>
            </section>
          )}

          {isShaDodgedEquipment && (
            <section className={styles.section}>
              <h3>选择武器效果</h3>
              {(prompt.options ?? [])
                .filter((option) => option.id !== 'skip' && option.id !== 'guanshi:force')
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.primary}
                    onClick={() => onConfirmPlay(prompt.id, option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              {(prompt.options ?? []).some((option) => option.id === 'guanshi:force') && (
                <>
                  <p className={styles.muted}>发动【贯石斧】需弃置两张手牌或装备。</p>
                  <ul className={styles.cardPickList}>
                    {skillCardOptions.map((option, index) => (
                      <li key={option.id}>
                        <label className={styles.targetOption}>
                          <input
                            type="checkbox"
                            name="guanshi-card"
                            checked={rendeCardIndices.includes(index)}
                            onChange={() => toggleSkillZoneCard(option.id)}
                          />
                          <span>{option.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={rendeCardIndices.length !== discardNeed}
                    onClick={() => {
                      const selected = rendeCardIndices
                        .map((index) => skillCardOptions[index]?.id)
                        .filter((id): id is string => !!id)
                        .join(',');
                      onConfirmPlay(prompt.id, `guanshi:force:cards:${selected}`);
                    }}
                  >
                    发动【贯石斧】
                  </button>
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'skip')}
                >
                  不发动
                </button>
              </div>
            </section>
          )}

          {isFanjian && (
            <section className={styles.section}>
              <h3>{prompt.sourcePlayerId ? '选择反间结算' : '交给一张手牌'}</h3>
              {prompt.sourcePlayerId ? (
                <div className={styles.actions}>
                  {(prompt.options ?? []).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={styles.primary}
                      onClick={() => onConfirmPlay(prompt.id, option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {!noLegalTargets && (
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
                            {formatGeneralName(target)} 体力:{target.hp ?? 0}/{target.maxHp ?? 0}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <CardPickChips
                    cards={rendeHand}
                    selectedIndices={rendeCardIndices}
                    onToggle={(index) => setRendeCardIndices([index])}
                  />
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={noLegalTargets || !rendeTarget || rendeCardIndices.length !== 1}
                      onClick={() =>
                        onConfirmPlay(prompt.id, `fanjian:give:${rendeTarget}:${rendeCardIndices[0]}`)
                      }
                    >
                      确认反间
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => onConfirmPlay(prompt.id, 'cancel')}
                    >
                      取消
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {isDiscardDrawSkill && (
            <section className={styles.section}>
              <h3>弃置一张手牌</h3>
              <CardPickChips
                cards={discardDrawHand}
                selectedIndices={discardIndices}
                onToggle={(index) => setDiscardIndices([index])}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={discardIndices.length !== 1}
                  onClick={() => onConfirmPlay(prompt.id, `qinxue:${discardIndices[0]}`)}
                >
                  确认发动
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'skip')}
                >
                  不发动
                </button>
              </div>
            </section>
          )}

          {isDiscardRedThenChoose && (
            <section className={styles.section}>
              <h3>弃置一张红色手牌</h3>
              <CardPickChips
                cards={discardRedHand}
                selectedIndices={discardIndices}
                allowedIndices={prompt.discardHandIndices}
                onToggle={(index) => setDiscardIndices([index])}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={discardIndices.length !== 1}
                  onClick={() => onConfirmPlay(prompt.id, `zhaxiang:recover:hand:${discardIndices[0]}`)}
                >
                  回复体力
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={discardIndices.length !== 1}
                  onClick={() => onConfirmPlay(prompt.id, `zhaxiang:draw:hand:${discardIndices[0]}`)}
                >
                  摸两张牌
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'skip')}
                >
                  不发动
                </button>
              </div>
            </section>
          )}

          {isVirtualCardPick && (
            <section className={styles.section}>
              <h3>
                选择一张手牌当【{stripGeneralPrefixInText(prompt.cardName ?? '牌')}】使用
              </h3>
              <CardPickChips
                cards={virtualCardPickHand}
                selectedIndices={discardIndices}
                allowedIndices={prompt.discardHandIndices}
                onToggle={(index) => setDiscardIndices([index])}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={discardIndices.length !== 1 || !prompt.skillId}
                  onClick={() =>
                    onConfirmPlay(prompt.id, `${prompt.skillId}:hand:${discardIndices[0]}`)
                  }
                >
                  确认使用
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

          {isLijian && (
            <section className={styles.section}>
              <h3>选择离间目标</h3>
              <label className={styles.fieldLabel}>
                决斗来源
                <select
                  className={styles.select}
                  value={rendeTarget}
                  onChange={(event) => setRendeTarget(event.target.value)}
                >
                  <option value="">请选择男性角色</option>
                  {validTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {formatGeneralName(target)} 手牌:{target.handCards?.length ?? 0}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                决斗目标
                <select
                  className={styles.select}
                  value={zonePickId}
                  onChange={(event) => setZonePickId(event.target.value)}
                >
                  <option value="">请选择另一名男性角色</option>
                  {lijianTargetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {formatGeneralName(target)} 手牌:{target.handCards?.length ?? 0}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                弃置牌
                <select
                  className={styles.select}
                  value={skillZoneCardId}
                  onChange={(event) => setSkillZoneCardId(event.target.value)}
                >
                  <option value="">请选择一张牌</option>
                  {lijianCardOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!rendeTarget || !zonePickId || !skillZoneCardId}
                  onClick={() =>
                    onConfirmPlay(
                      prompt.id,
                      `lijian:${rendeTarget}:${zonePickId}:${skillZoneCardId}`,
                    )
                  }
                >
                  确认离间
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

          {isLiyu && (
            <section className={styles.section}>
              <h3>选择利驭结算</h3>
              {!noLegalTargets && (
                <label className={styles.fieldLabel}>
                  决斗目标
                  <select
                    className={styles.select}
                    value={rendeTarget}
                    onChange={(event) => setRendeTarget(event.target.value)}
                  >
                    <option value="">请选择另一名角色</option>
                    {validTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {formatGeneralName(target)} 手牌:{target.handCards?.length ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={styles.fieldLabel}>
                交给吕布的牌
                <select
                  className={styles.select}
                  value={skillZoneCardId}
                  onChange={(event) => setSkillZoneCardId(event.target.value)}
                >
                  <option value="">请选择一张牌</option>
                  {liyuCardOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={noLegalTargets || !rendeTarget || !skillZoneCardId}
                  onClick={() =>
                    onConfirmPlay(prompt.id, `liyu:${rendeTarget}:${skillZoneCardId}`)
                  }
                >
                  确认利驭
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onConfirmPlay(prompt.id, 'skip')}
                >
                  不发动
                </button>
              </div>
            </section>
          )}

          {isYijuePindian && (
            <section className={styles.section}>
              <h3>拼点</h3>
              {!noLegalTargets && (
                <label className={styles.fieldLabel}>
                  目标角色
                  <select
                    className={styles.select}
                    value={rendeTarget}
                    onChange={(event) => {
                      setRendeTarget(event.target.value);
                      setZonePickId('');
                    }}
                  >
                    <option value="">请选择目标角色</option>
                    {validTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {formatGeneralName(target)} 手牌:{target.handCards?.length ?? 0}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className={styles.muted}>选择自己用于拼点的一张手牌：</p>
              <CardPickChips
                cards={yijueSourceHand}
                selectedIndices={discardIndices}
                allowedIndices={prompt.discardHandIndices}
                onToggle={(index) => setDiscardIndices([index])}
              />
              {rendeTarget && (
                <>
                  <p className={styles.muted}>选择目标用于拼点的一张手牌：</p>
                  <CardPickChips
                    cards={yijueTargetHand}
                    selectedIndices={zonePickId ? [Number(zonePickId)] : []}
                    onToggle={(index) => setZonePickId(String(index))}
                  />
                </>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    noLegalTargets ||
                    !rendeTarget ||
                    discardIndices.length !== 1 ||
                    zonePickId === ''
                  }
                  onClick={() =>
                    onConfirmPlay(
                      prompt.id,
                      `yijue:pindian:${rendeTarget}:${discardIndices[0]}:${zonePickId}`,
                    )
                  }
                >
                  确认拼点
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

          {isYijueRecover && (
            <section className={styles.section}>
              <h3>拼点未赢</h3>
              <div className={styles.actions}>
                {(prompt.options ?? []).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.id === 'skip' ? styles.secondary : styles.primary}
                    onClick={() => onConfirmPlay(prompt.id, option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {isGuanxing && guanxingCards.length > 0 && (
            <section className={styles.section}>
              <h3>调整牌堆</h3>
              <p className={styles.muted}>
                {isXunxun
                  ? '前 2 张按顺序置于牌堆顶，其余按顺序置于牌堆底。拖拽卡牌调整顺序。'
                  : '上方会按顺序置于牌堆顶，下方会按顺序沉底。'}
              </p>
              {!isXunxun && (
                <label className={styles.fieldLabel}>
                  置于牌堆顶张数
                  <select
                    className={styles.select}
                    value={guanxingTopCount}
                    onChange={(event) => setGuanxingTopCount(Number(event.target.value))}
                  >
                    {orderedGuanxingCards.map((_, index) => (
                      <option key={index} value={index}>
                        {index}
                      </option>
                    ))}
                    <option value={orderedGuanxingCards.length}>{orderedGuanxingCards.length}</option>
                  </select>
                </label>
              )}
              <ul className={`${styles.cardPickList} ${styles.sortableList}`}>
                {orderedGuanxingCards.map((card, position) => {
                  const topLimit = isXunxun ? 2 : guanxingTopCount;
                  return (
                    <li
                      key={`${card}-${guanxingOrder[position]}`}
                      draggable
                      className={draggedGuanxingPosition === position ? styles.draggingItem : undefined}
                      onDragStart={() => handleGuanxingDragStart(position)}
                      onDragEnter={() => handleGuanxingDragEnter(position)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={handleGuanxingDragEnd}
                    >
                      <div className={`${styles.targetOption} ${styles.sortableOption}`}>
                        <span className={styles.dragHandle} aria-hidden="true">⋮⋮</span>
                        <span className={styles.sortableCardText}>
                          {position < topLimit ? '顶' : '底'} · {formatHandCardLabel(card)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    onConfirmPlay(
                      prompt.id,
                      isXunxun
                        ? `xunxun:confirm:2:${guanxingOrder.join(',')}`
                        : `guanxing:confirm:${guanxingTopCount}:${guanxingOrder.join(',')}`,
                    )
                  }
                >
                  {isXunxun ? '确认调整' : '确认观星'}
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
              <h3>选择
                <span style={{ fontWeight: 'bold', color: 'red' }}>{formatGeneralName(zonePickTarget)}</span>
                区域中的一张牌
              </h3>
              {zonePickTarget && (
                // <p className={styles.muted}>
                //   目标：{formatGeneralName(zonePickTarget)}（手牌
                //   {zonePickTarget.handCards?.length ?? 0}张，装备
                //   {zonePickTarget.equipment?.length ?? 0}件，判定
                //   {zonePickTarget.judgeCards?.length ?? 0}张）
                // </p>
                <p className={styles.muted} style={{ marginBottom: '10px' }}>（手牌
                  {zonePickHandCount}张，装备
                  {zonePickTarget.equipment?.length ?? 0}件，判定
                  {zonePickTarget.judgeCards?.length ?? 0}张）
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
            !isDiscardRecoverSkill &&
            !isJianyan &&
            !isLiuli &&
            !isShaDodgedEquipment &&
            !isDiscardDrawSkill &&
            !isDiscardRedThenChoose &&
            !isZhiheng &&
            !isGuanxing &&
            !isModifyJudge &&
            !isDiscard &&
            !isZonePick &&
            !isJiedao &&
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
                      if (prompt.type === 'response' || prompt.type === 'dying_rescue') {
                        onSubmitResponse(prompt.id, option.id);
                      } else {
                        onConfirmPlay(prompt.id, option.id);
                      }
                    }}
                  >
                    {formatResponseOptionLabel(option.id, option.label)}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
