import { CharacterRegistry } from '../registry/character-registry';
import type { CardDefinition } from '../types/card';
import type { EnginePlayerState, EngineSnapshot, GamePrompt } from '../types/game';
import type { GameEvent } from '../types/event';
import { GameEventType } from '../types/event';
import {
  createInitialGameState,
  snapshotState,
  type GameState,
} from '../state/game-state';
import { ResolutionStack } from '../resolution/resolution-stack';
import { TargetQueue } from '../resolution/target-queue';
import {
  EventResolver,
  createDamageEvent,
  type EventResolverHost,
} from '../resolution/event-resolver';
import { CardPlayService } from '../resolution/card-play-service';
import { SkillPlayService } from '../resolution/skill-play-service';
import {
  getCardPlayContext,
  getDyingRescueContext,
  getYajiaoContext,
  getZonePickContext,
  setPendingReactive,
  setCardPlayContext,
  setDyingRescueContext,
  setYajiaoContext,
  setZonePickContext,
} from '../resolution/card-play-context';
import { cardNameFromHandEntry, formatHandEntryForLog } from '../engine/card-label';
import { removeCardFromHand } from '../engine/effect-runner';
import { validResponseCardsForPlayer } from '../engine/virtual-card';
import { nextPromptId } from '../utils/prompt-id';
import { TurnRunner, type TurnRunnerHost } from './turn-runner';
import { TurnPhaseMachine } from '../fsm/turn-phase-machine';
import { normalizeHandEntry } from '../engine/card-label';
import type { PendingJudge } from '../engine/judge-runner';
import {
  characterSkillsForPrompt,
  applyLockedModifiers,
  collectOptionalSkillOffers,
  playerHasSkill,
  runSkillEffects,
} from '../engine/timing-runner';
import { GameTiming } from '../types/timing';
import { RuleManager } from '../rules/rule-manager';
import { ConfigRuleLoader } from '../rules/config-rule-loader';
import { DeckPile } from '../engine/deck-pile';
import { CardRegistry } from '../registry/card-registry';
import type { RoomPlayerInput } from '../engine/game-engine';
import { checkVictory } from './identity';
import { discardOneFromZone } from '../engine/equipment-zone';
import { createCardInstance, formatCardInstance, isBlack, isRed } from '../engine/card-instance';
import { canDiscardZoneCard, listZoneCards, parseZoneCardId } from '../engine/zone-card-pick';

let eventIdSeq = 0;

function nextEventId(): string {
  eventIdSeq += 1;
  return `evt_${eventIdSeq}`;
}

export interface SangokushiEngineOptions {
  players: EnginePlayerState[];
}

/**
 * 配置驱动引擎：杀 → 闪 → 伤害（栈）→ 受伤后技能（奸雄/反馈等配置触发）。
 */
export class SangokushiEngine implements EventResolverHost, TurnRunnerHost {
  readonly state: GameState;
  readonly fsm = new TurnPhaseMachine();
  readonly stack = new ResolutionStack();
  readonly rules: RuleManager;
  readonly resolver: EventResolver;
  readonly cardPlay = new CardPlayService();
  readonly skillPlay = new SkillPlayService();
  private readonly turnRunner: TurnRunner;
  private readonly deck: DeckPile;
  private targetQueue: TargetQueue | null = null;
  private pendingJudge: PendingJudge | null = null;

  static findLordIndex(players: { role?: string }[]): number {
    const idx = players.findIndex((p) => p.role === '主公');
    return idx >= 0 ? idx : 0;
  }

  static fromRoomPlayers(inputs: RoomPlayerInput[]): EnginePlayerState[] {
    return inputs.map((p, i) => {
      const ch = CharacterRegistry.resolve(p.general ?? p.nickname);
      const isLord = p.role === '主公';
      const maxHp = (p.maxHp ?? ch?.maxHp ?? 4) + (isLord ? 1 : 0);
      return {
        id: p.id,
        seat: p.seat ?? i + 1,
        nickname: p.nickname,
        generalId: ch?.id ?? 'unknown',
        generalName: ch?.name ?? p.general ?? p.nickname,
        role: p.role ?? '反贼',
        roleRevealed: p.role === '主公',
        kingdom: ch?.kingdom ?? 'qun',
        hp: p.hp ?? maxHp,
        maxHp,
        handCards: [...(p.handCards ?? [])],
        equipment: [...(p.equipment ?? [])],
        judgeCards: [...(p.judgeCards ?? [])],
        shaUsedCount: 0,
        skillUseCount: {},
        skillTargetUseCount: {},
        usedLimitedSkills: {},
        lastTurnEndHp: p.hp ?? maxHp,
        dead: false,
      };
    });
  }

  constructor(options: SangokushiEngineOptions | { roomPlayers: RoomPlayerInput[] }) {
    const players =
      'roomPlayers' in options
        ? SangokushiEngine.fromRoomPlayers(options.roomPlayers)
        : options.players;
    this.deck = new DeckPile();
    this.deck.reset();
    for (const p of players) {
      p.handCards = p.handCards.map((c) => normalizeHandEntry(c));
    }
    this.state = createInitialGameState(players, this.deck.remaining());
    this.rules = new RuleManager();
    this.rules.registerAll(new ConfigRuleLoader().loadAll());
    this.resolver = new EventResolver(this.rules);
    this.turnRunner = new TurnRunner(this);
    this.fsm.set('judge');
  }

  getFsm(): TurnPhaseMachine {
    return this.fsm;
  }

  getPendingJudge(): PendingJudge | null {
    return this.pendingJudge;
  }

  setPendingJudge(p: PendingJudge | null): void {
    this.pendingJudge = p;
  }

  startJudgePhase(): void {
    this.turnRunner.startJudgePhase();
  }

  beginTurnForTest(): void {
    this.turnRunner.beginTurn();
  }

  getState(): GameState {
    return this.state;
  }

  getDeck(): DeckPile {
    return this.deck;
  }

  syncState(): void {
    this.syncStackToState();
  }

  getSnapshot(): EngineSnapshot {
    return {
      turnIndex: this.state.turn.index,
      round: this.state.turn.round,
      turnPhase: this.state.turn.phase,
      log: [...this.state.log],
      prompt: this.state.prompt,
      players: this.state.players.map((p) => ({
        ...p,
        handCards: [...p.handCards],
        skillTargetUseCount: { ...p.skillTargetUseCount },
      })),
      victory: this.state.victory ?? null,
      pendingJudge: this.pendingJudge
        ? {
            targetPlayerId: this.pendingJudge.targetPlayerId,
            judgeCardName: this.pendingJudge.judgeCardName,
            result: { ...this.pendingJudge.result },
            modifyQueue: [...this.pendingJudge.modifyQueue],
            modifyIndex: this.pendingJudge.modifyIndex,
            modified: this.pendingJudge.modified,
          }
        : undefined,
    };
  }

  setPrompt(prompt: GamePrompt | null): void {
    this.state.prompt = prompt;
  }

  log(message: string): void {
    this.state.log.unshift(message);
  }

  private executeZhuhai(playerId: string): { ok: boolean; error?: string } {
    const prompt = this.state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'zhuhai') {
      return { ok: false, error: '当前不是【诛害】询问' };
    }
    if (prompt.playerId !== playerId) return { ok: false, error: '不是你发动【诛害】' };

    const source = this.state.players.find((player) => player.id === playerId);
    const targetId = prompt.sourcePlayerId ?? prompt.targetPlayerIds?.[0];
    const target = this.state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (!playerHasSkill(source, 'zhuhai')) return { ok: false, error: '没有【诛害】技能' };
    if ((target.skillUseCount._damage_dealt_this_turn ?? 0) <= 0) {
      return { ok: false, error: '目标本回合未造成过伤害' };
    }

    const handIndex = source.handCards.findIndex((card) => cardNameFromHandEntry(card) === '杀');
    if (handIndex < 0) return { ok: false, error: '没有可用于【诛害】的【杀】' };

    const shaCard = CardRegistry.getByName('杀');
    if (!shaCard) return { ok: false, error: '缺少【杀】卡牌配置' };

    const usedCard = source.handCards.splice(handIndex, 1)[0]!;
    this.deck.discardCard(usedCard);
    this.afterPlayerLostHandCards(source, 1);
    this.afterPlayerUsedOrRespondedHandCard(source, usedCard);
    source.shaUsedCount += 1;
    source.skillUseCount.zhuhai = (source.skillUseCount.zhuhai ?? 0) + 1;
    this.log(`${source.generalName} 发动【诛害】，对 ${target.generalName} 使用【杀】`);

    const timingContext = { source, card: shaCard, responsesRequired: 1 };
    applyLockedModifiers(timingContext);
    setCardPlayContext(this.state.resolution.context, {
      cardId: shaCard.id,
      sourcePlayerId: source.id,
      targetPlayerIds: [target.id],
      isAoe: false,
      responseType: 'shan',
      responsesRequired: timingContext.responsesRequired ?? 1,
      responseCount: 0,
      awaitingResponseFrom: target.id,
      virtualFromSkill: 'zhuhai',
      committedCardEntry: usedCard,
      cardCommitted: true,
      returnToEndPhaseAfterResolve: true,
    });
    this.setPrompt({
      id: nextPromptId(),
      type: 'response',
      playerId: target.id,
      cardId: shaCard.id,
      cardName: shaCard.name,
      sourcePlayerId: source.id,
      targetPlayerIds: [target.id],
      validResponseCards: validResponseCardsForPlayer(target, 'shan', target.handCards),
      message: `${target.generalName}：请打出【闪】响应【诛害】的【杀】`,
      options: [{ id: 'pass', label: '不出（受到伤害）' }],
    });
    this.syncStackToState();
    return { ok: true };
  }

  onCardCommitted(params: {
    source: EnginePlayerState;
    card: CardDefinition;
    targets: EnginePlayerState[];
  }): void {
    if (params.card.type !== 'trick' || params.card.subType === 'delay') return;
    if (!playerHasSkill(params.source, 'jizhi')) return;

    const drawn = this.deck.drawMany(1);
    params.source.handCards.push(...drawn);
    this.afterPlayerGainedCards(params.source, drawn);
    params.source.skillUseCount.jizhi = (params.source.skillUseCount.jizhi ?? 0) + 1;
    this.log(
      `${params.source.generalName} 发动【集智】，因使用【${params.card.name}】摸 ${drawn.length} 张牌`,
    );
  }

  afterPlayerLostHandCards(player: EnginePlayerState, lostCount: number): void {
    if (lostCount <= 0 || player.handCards.length > 0) return;
    if (!playerHasSkill(player, 'lianying')) return;

    const drawn = this.deck.drawMany(1);
    player.handCards.push(...drawn);
    this.afterPlayerGainedCards(player, drawn);
    player.skillUseCount.lianying = (player.skillUseCount.lianying ?? 0) + 1;
    this.log(`${player.generalName} 发动【连营】，摸 ${drawn.length} 张牌`);
  }

  afterPlayerUsedOrRespondedHandCard(player: EnginePlayerState, cardEntry: string): void {
    const currentPlayer = this.state.players[this.state.turn.index];
    if (currentPlayer?.id === player.id) return;
    if (this.state.resolution.context.yajiao) return;
    if (!playerHasSkill(player, 'yajiao') || player.hp <= 0 || player.dead) return;

    const revealedCard = this.deck.drawOne();
    if (!revealedCard) return;
    const usedCategory = this.cardCategoryOfEntry(cardEntry);
    const revealedCategory = this.cardCategoryOfEntry(revealedCard);
    if (!usedCategory || !revealedCategory) {
      this.deck.discardCard(revealedCard);
      this.log(`${player.generalName} 发动【涯角】，展示 ${revealedCard}，类别未知，置入弃牌堆`);
      return;
    }

    player.skillUseCount.yajiao = (player.skillUseCount.yajiao ?? 0) + 1;
    if (usedCategory !== revealedCategory) {
      this.deck.discardCard(revealedCard);
      this.log(`${player.generalName} 发动【涯角】，展示 ${revealedCard}，类别不同，置入弃牌堆`);
      return;
    }

    const targets = this.state.players
      .filter((item) => item.hp > 0 && !item.dead)
      .map((item) => item.id);
    setYajiaoContext(this.state.resolution.context, { playerId: player.id, revealedCard });
    this.log(`${player.generalName} 发动【涯角】，展示 ${revealedCard}，类别相同`);
  }

  private promptPendingYajiao(): boolean {
    const context = getYajiaoContext(this.state.resolution.context);
    if (!context || this.state.prompt) return false;
    const player = this.state.players.find((item) => item.id === context.playerId);
    if (!player || player.hp <= 0 || player.dead) {
      if (context.revealedCard) this.deck.discardCard(context.revealedCard);
      setYajiaoContext(this.state.resolution.context, undefined);
      return false;
    }
    const targets = this.state.players
      .filter((item) => item.hp > 0 && !item.dead)
      .map((item) => item.id);
    this.setPrompt({
      id: nextPromptId(),
      type: 'assign_revealed',
      playerId: context.playerId,
      skillId: 'yajiao',
      skillName: '涯角',
      message: `【涯角】：展示 ${context.revealedCard}，请选择一名角色获得之。`,
      validTargetIds: targets,
      options: targets.map((targetId) => {
        const target = this.state.players.find((item) => item.id === targetId)!;
        return { id: `target:${target.id}`, label: `交给 ${target.generalName}` };
      }),
    });
    return true;
  }

  private submitYajiaoChoice(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const prompt = this.state.prompt;
    const context = getYajiaoContext(this.state.resolution.context);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'assign_revealed' || prompt.playerId !== playerId || context.playerId !== playerId) {
      return { ok: false, error: '当前不能结算【涯角】' };
    }
    if (!choiceId.startsWith('target:')) return { ok: false, error: '请选择获得角色' };

    const source = this.state.players.find((player) => player.id === playerId);
    const target = this.state.players.find((player) => player.id === choiceId.slice(7));
    if (!source || !target || target.hp <= 0 || target.dead) {
      return { ok: false, error: '目标无效' };
    }

    target.handCards.push(context.revealedCard);
    this.afterPlayerGainedCards(target, [context.revealedCard]);
    this.log(`${source.generalName} 将【涯角】展示牌 ${context.revealedCard} 交给 ${target.generalName}`);
    setYajiaoContext(this.state.resolution.context, undefined);
    this.setPrompt(null);
    this.syncStackToState();
    return { ok: true };
  }

  private cardCategoryOfEntry(entry: string): CardDefinition['type'] | undefined {
    return CardRegistry.getByName(cardNameFromHandEntry(entry))?.type;
  }

  afterPlayerLostEquipmentCards(player: EnginePlayerState, lostCount: number): void {
    if (lostCount <= 0 || player.hp <= 0 || player.dead) return;
    if (!playerHasSkill(player, 'xiaoji')) return;

    const totalDrawn: string[] = [];
    for (let i = 0; i < lostCount; i++) {
      totalDrawn.push(...this.deck.drawMany(2));
    }
    player.handCards.push(...totalDrawn);
    this.afterPlayerGainedCards(player, totalDrawn);
    player.skillUseCount.xiaoji = (player.skillUseCount.xiaoji ?? 0) + lostCount;
    this.log(
      `${player.generalName} 发动【枭姬】，因失去 ${lostCount} 张装备摸 ${totalDrawn.length} 张牌`,
    );
  }

  afterPlayerGainedCards(player: EnginePlayerState, gainedCards: string[]): void {
    if (gainedCards.length === 0) return;
    if (this.state.turn.phase === 'draw') return;
    if (!playerHasSkill(player, 'qingjian') || player.hp <= 0 || player.dead) return;
    if (this.state.prompt) return;
    if (this.state.resolution.context.qingjianPending) return;

    const usedIndices = new Set<number>();
    const allowedIndices = gainedCards
      .map((card) => {
        const index = player.handCards.findIndex(
          (entry, handIndex) => entry === card && !usedIndices.has(handIndex),
        );
        if (index >= 0) usedIndices.add(index);
        return index;
      })
      .filter((index) => index >= 0);
    if (allowedIndices.length === 0) return;

    const targets = this.state.players
      .filter((target) => target.id !== player.id && target.hp > 0 && !target.dead)
      .map((target) => target.id);
    if (targets.length === 0) return;

    this.state.resolution.context.qingjianPending = {
      playerId: player.id,
      remainingCards: [...gainedCards],
      used: false,
    };
    this.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: player.id,
      skillId: 'qingjian',
      skillName: '清俭',
      skillAction: 'give_cards',
      characterSkills: characterSkillsForPrompt(player),
      message: `【清俭】：摸牌阶段外获得 ${gainedCards.length} 张牌，可将其中任意张交给其他角色。`,
      validTargetIds: targets,
      discardCount: gainedCards.length,
      discardHandIndices: allowedIndices,
      options: [{ id: 'qingjian:finish', label: '完成清俭' }],
    });
  }

  private resolveWangxiAfterDamage(
    source: EnginePlayerState,
    victim: EnginePlayerState,
    amount: number,
  ): void {
    if (amount <= 0 || source.id === victim.id) return;

    const pairs: Array<[EnginePlayerState, EnginePlayerState]> = [];
    if (playerHasSkill(source, 'wangxi') && source.hp > 0 && !source.dead) {
      pairs.push([source, victim]);
    }
    if (playerHasSkill(victim, 'wangxi') && victim.hp > 0 && !victim.dead) {
      pairs.push([victim, source]);
    }

    for (const [owner, other] of pairs) {
      const ownerDrawn = this.deck.drawMany(1);
      const otherDrawn = this.deck.drawMany(1);
      owner.handCards.push(...ownerDrawn);
      other.handCards.push(...otherDrawn);
      this.afterPlayerGainedCards(owner, ownerDrawn);
      this.afterPlayerGainedCards(other, otherDrawn);
      owner.skillUseCount.wangxi = (owner.skillUseCount.wangxi ?? 0) + 1;
      this.log(
        `${owner.generalName} 发动【忘隙】，${owner.generalName} 与 ${other.generalName} 各摸 1 张牌`,
      );
    }
  }

  private resolveQiaomengAfterDamage(
    source: EnginePlayerState,
    victim: EnginePlayerState,
    event: GameEvent,
  ): void {
    const damageCardName = event.payload.damageCardName as string | undefined;
    if (!damageCardName || cardNameFromHandEntry(damageCardName) !== '杀') return;
    if (!playerHasSkill(source, 'qiaomeng') || source.hp <= 0 || source.dead) return;
    if (victim.hp <= 0 || victim.dead || victim.equipment.length === 0) return;
    if (!isBlack(createCardInstance(damageCardName))) return;

    this.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: source.id,
      skillId: 'qiaomeng',
      skillName: '趫猛',
      cardName: '杀',
      sourcePlayerId: source.id,
      targetPlayerIds: [victim.id],
      characterSkills: characterSkillsForPrompt(source),
      zoneCardOptions: victim.equipment.map((cardName, index) => ({
        id: `equipment:${index}`,
        label: `装备【${cardName}】`,
      })),
      message: `${source.generalName}：是否发动【趫猛】弃置 ${victim.generalName} 装备区的一张牌？`,
      options: [
        { id: 'skill:qiaomeng', label: '发动【趫猛】' },
        { id: 'skip', label: '不发动' },
      ],
    });
    setPendingReactive(this.state.resolution.context, {
      eventId: event.id,
      playerId: source.id,
      skillId: 'qiaomeng',
    });
  }

  private resolveLiyuAfterDamage(
    source: EnginePlayerState,
    victim: EnginePlayerState,
    event: GameEvent,
  ): void {
    const damageCardName = event.payload.damageCardName as string | undefined;
    if (!damageCardName || cardNameFromHandEntry(damageCardName) !== '杀') return;
    if (!playerHasSkill(source, 'liyu') || source.hp <= 0 || source.dead) return;
    if (source.id === victim.id || victim.hp <= 0 || victim.dead) return;
    if (victim.handCards.length + victim.equipment.length + victim.judgeCards.length === 0) return;
    const duelTargets = this.state.players
      .filter((player) => player.id !== source.id && player.id !== victim.id && player.hp > 0 && !player.dead)
      .map((player) => player.id);
    if (duelTargets.length === 0) return;

    this.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: victim.id,
      skillId: 'liyu',
      skillName: '利驭',
      skillAction: 'give_card_duel_target',
      cardName: '杀',
      sourcePlayerId: source.id,
      targetPlayerIds: [victim.id],
      validTargetIds: duelTargets,
      skillCardOptions: listZoneCards(victim, { hideHand: false, shuffleHand: false }),
      message: `${victim.generalName}：是否发动 ${source.generalName} 的【利驭】，令其获得你一张牌并指定另一名角色进行【决斗】？`,
      options: [
        { id: 'skill:liyu', label: '发动【利驭】' },
        { id: 'skip', label: '不发动' },
      ],
    });
    setPendingReactive(this.state.resolution.context, {
      eventId: event.id,
      playerId: victim.id,
      skillId: 'liyu',
    });
  }

  private resolveQianxinAfterDamage(source: EnginePlayerState): void {
    if (!playerHasSkill(source, 'qianxin') || source.hp <= 0 || source.dead) return;
    if (source.usedLimitedSkills?.qianxin) return;
    if (source.hp >= source.maxHp) return;

    source.maxHp = Math.max(1, source.maxHp - 1);
    source.hp = Math.min(source.hp, source.maxHp);
    source.usedLimitedSkills = {
      ...(source.usedLimitedSkills ?? {}),
      qianxin: true,
    };
    source.skillUseCount.qianxin = (source.skillUseCount.qianxin ?? 0) + 1;
    this.log(
      `${source.generalName} 触发觉醒技【潜心】，减 1 点体力上限并获得【荐言】（${source.hp}/${source.maxHp}）`,
    );
  }

  private submitQiaomeng(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const prompt = this.state.prompt;
    if (!prompt || prompt.id !== promptId || prompt.skillId !== 'qiaomeng') {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.playerId !== playerId) return { ok: false, error: '不能替其他角色操作' };

    if (choiceId === 'skip') {
      setPendingReactive(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return { ok: true };
    }

    if (!choiceId.startsWith('qiaomeng:')) {
      return { ok: false, error: '请选择要弃置的装备' };
    }

    const index = Number(choiceId.slice('qiaomeng:'.length));
    const source = this.state.players.find((player) => player.id === playerId);
    const targetId = prompt.targetPlayerIds?.[0];
    const target = this.state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '目标不存在' };
    if (!Number.isInteger(index) || index < 0 || index >= target.equipment.length) {
      return { ok: false, error: '所选牌无效' };
    }

    const [removed] = target.equipment.splice(index, 1);
    if (!removed) return { ok: false, error: '所选牌无效' };

    const subType = CardRegistry.getByName(removed)?.subType;
    const isHorse = subType === 'horse_plus' || subType === 'horse_minus';
    if (isHorse) {
      source.handCards.push(removed);
      this.afterPlayerGainedCards(source, [removed]);
      this.log(`${source.generalName} 发动【趫猛】，获得 ${target.generalName} 的坐骑【${removed}】`);
    } else {
      this.deck.discardCard(removed);
      this.log(`${source.generalName} 发动【趫猛】，弃置 ${target.generalName} 的装备【${removed}】`);
    }
    this.afterPlayerLostEquipmentCards(target, 1);

    source.skillUseCount.qiaomeng = (source.skillUseCount.qiaomeng ?? 0) + 1;
    setPendingReactive(this.state.resolution.context, undefined);
    this.setPrompt(null);
    this.syncStackToState();
    return { ok: true };
  }

  private performLuoshen(player: EnginePlayerState): { ok: boolean; error?: string } {
    const card = this.deck.drawOne();
    if (!card) {
      this.setPrompt(null);
      this.turnRunner.startJudgePhase();
      return { ok: true };
    }

    const result = createCardInstance(card);
    const formatted = formatCardInstance(result);
    const isBlackJudge = result.suit === '♠' || result.suit === '♣';
    player.skillUseCount.luoshen = (player.skillUseCount.luoshen ?? 0) + 1;
    this.log(`${player.generalName} 发动【洛神】，判定：${formatted}`);

    if (!isBlackJudge) {
      this.deck.discardCard(card);
      this.setPrompt(null);
      this.syncStackToState();
      this.turnRunner.startJudgePhase();
      return { ok: true };
    }

    player.handCards.push(card);
    this.afterPlayerGainedCards(player, [card]);
    this.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: player.id,
      skillId: 'luoshen',
      skillName: '洛神',
      characterSkills: characterSkillsForPrompt(player),
      message: `【洛神】判定为黑色，已获得 ${formatted}。是否继续判定？`,
      options: [
        { id: 'luoshen:continue', label: '继续洛神' },
        { id: 'luoshen:stop', label: '停止，进入判定' },
      ],
    });
    this.syncStackToState();
    return { ok: true };
  }

  snapshot(): GameState {
    return snapshotState(this.state);
  }

  /** 开局：定位主公，发初始手牌，从判定阶段开始完整回合 */
  start(): void {
    this.deck.reset();
    this.state.turn.index = SangokushiEngine.findLordIndex(
      this.state.players.map((p) => ({ role: p.role })),
    );
    this.state.turn.round = 1;
    this.pendingJudge = null;
    this.setPrompt(null);
    const lord = this.state.players[this.state.turn.index];
    this.log(`【开局】从主公 ${lord?.generalName ?? lord?.nickname} 开始`);
    this.turnRunner.dealOpeningHands(4);
    this.turnRunner.beginTurn();
  }

  // —— 用牌（配置驱动） ——

  initiatePlayCard(
    sourceId: string,
    cardName: string,
    handIndex?: number,
  ): { ok: boolean; error?: string } {
    const cur = this.state.players[this.state.turn.index];
    if (!cur || cur.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    return this.cardPlay.initiatePlayCard(this, sourceId, cardName, handIndex);
  }

  confirmPlayCard(
    sourceId: string,
    promptId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = this.cardPlay.confirmPlayCard(this, sourceId, promptId);
    if (!res.ok) return Promise.resolve(res);
    if (this.state.prompt?.type === 'select_targets') {
      return Promise.resolve(res);
    }
    this.syncStackToState();
    return this.continueAfterCardPlayStart(res);
  }

  selectTargets(
    sourceId: string,
    promptId: string,
    targetIds: string[],
    zoneCardId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = this.cardPlay.selectTargets(this, sourceId, promptId, targetIds, zoneCardId);
    if (!res.ok) return Promise.resolve(res);
    return this.continueAfterCardPlayStart(res);
  }

  private async continueAfterCardPlayStart(res: {
    ok: boolean;
    error?: string;
    paused?: boolean;
    scheduleAoe?: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!res.ok) return res;
    if (res.scheduleAoe) {
      await this.drainStack();
      this.promptPendingYajiao();
      return { ok: true };
    }
    if (res.paused || this.state.prompt) return { ok: true };
    this.promptPendingYajiao();
    return { ok: true };
  }

  async submitPromptChoice(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const prompt = this.state.prompt;
    if (!prompt || prompt.id !== promptId) {
      return { ok: false, error: '提示已失效' };
    }

    if (
      choiceId === 'cancel' &&
      (prompt.type === 'select_targets' ||
        prompt.type === 'select_zone_card' ||
        prompt.type === 'play_card_confirm')
    ) {
      this.cardPlay.cancelPlay(this);
      return { ok: true };
    }

    if (choiceId === 'confirm' && prompt.type === 'play_card_confirm') {
      return this.confirmPlayCard(playerId, promptId);
    }

    if (prompt.type === 'use_skill') {
      if (prompt.skillId === 'qiaomeng') {
        return Promise.resolve(this.submitQiaomeng(playerId, promptId, choiceId));
      }
      if (prompt.skillId === 'liyu') {
        if (choiceId === 'skip') {
          setPendingReactive(this.state.resolution.context, undefined);
          this.setPrompt(null);
          return Promise.resolve({ ok: true });
        }
        if (choiceId.startsWith('liyu:')) {
          const [, duelTargetId, ...zoneParts] = choiceId.split(':');
          const res = this.skillPlay.executeLiyu(
            this,
            playerId,
            duelTargetId ?? '',
            zoneParts.join(':'),
          );
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
      }
      if (prompt.skillId === 'qianxun') {
        return Promise.resolve(
          this.cardPlay.submitQianxun(this, playerId, promptId, choiceId),
        );
      }
      if (prompt.skillId === 'liuli') {
        const parts = choiceId.split(':');
        const redirectTargetId = parts[2];
        const zoneCardId = parts.slice(3).join(':');
        const normalizedChoice = choiceId.startsWith('liuli:') ? 'skill:liuli' : choiceId;
        return Promise.resolve(
          this.cardPlay.submitLiuli(
            this,
            playerId,
            promptId,
            normalizedChoice,
            redirectTargetId,
            zoneCardId,
          ),
        );
      }
      if (prompt.skillId === 'tieqi') {
        return Promise.resolve(
          this.cardPlay.submitTieqi(this, playerId, promptId, choiceId),
        );
      }
      if (prompt.skillId === 'fenwei') {
        const parts = choiceId.split(':');
        const zoneCardId = parts.slice(2).join(':');
        const normalizedChoice = choiceId.startsWith('fenwei:') ? 'skill:fenwei' : choiceId;
        const res = this.cardPlay.submitFenwei(
          this,
          playerId,
          promptId,
          normalizedChoice,
          zoneCardId,
        );
        if (res.scheduleAoe) {
          await this.drainStack();
          await this.cardPlay.advanceAoeIfPending(this);
        }
        return Promise.resolve(res);
      }
      if (prompt.skillId === 'sha_dodged_equipment') {
        const [equipmentChoice, zoneText] = choiceId.split(':cards:');
        const zoneCardIds = (zoneText ?? '').split(',').filter(Boolean);
        const res = await this.cardPlay.submitShaDodgedEquipment(
          this,
          playerId,
          promptId,
          equipmentChoice ?? choiceId,
          zoneCardIds,
          (p) => this.applyDamage(p),
        );
        if (!res.ok || this.state.prompt) return res;
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        this.promptPendingYajiao();
        return { ok: true };
      }
      if (prompt.skillId === 'jianyan' && choiceId.startsWith('jianyan:')) {
        const [, declaration, targetIdFromChoice] = choiceId.split(':');
        const targetId = targetIdFromChoice || prompt.validTargetIds?.[0];
        if (!targetId) {
          return { ok: false, error: '荐言缺少目标' };
        }
        const res = this.skillPlay.executeJianyan(this, playerId, `jianyan:${declaration}`, targetId);
        if (!res.ok) {
          return Promise.resolve(res);
        }
        const cur = this.state.players[this.state.turn.index];
        this.log(`-- ${cur?.generalName ?? '角色'} 出牌阶段：可继续出牌、发动技能或结束回合`);
        return Promise.resolve({ ok: true });
      }
      if (prompt.skillId === 'fanjian') {
        if (choiceId.startsWith('fanjian:give:')) {
          const [, , targetId, handIndexText] = choiceId.split(':');
          const res = this.skillPlay.executeFanjianGive(
            this,
            playerId,
            targetId ?? '',
            Number(handIndexText),
          );
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
        if (choiceId.startsWith('fanjian:discard_same_suit') || choiceId.startsWith('fanjian:lose_hp')) {
          const res = this.skillPlay.executeFanjianResolve(this, playerId, choiceId);
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
      }
      if (prompt.skillId === 'lijian') {
        if (choiceId.startsWith('lijian:')) {
          const [, duelSourceId, duelTargetId, ...zoneParts] = choiceId.split(':');
          const zoneCardId = zoneParts.join(':');
          const res = this.skillPlay.executeLijian(
            this,
            playerId,
            duelSourceId ?? '',
            duelTargetId ?? '',
            zoneCardId,
          );
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
      }
      if (prompt.skillId === 'rende' && prompt.skillAction === 'virtual_basic') {
        if (choiceId.startsWith('rende:basic:')) {
          const cardName = choiceId.slice('rende:basic:'.length);
          const res = this.cardPlay.initiateVirtualSkillCard(this, playerId, cardName, 'rende');
          return Promise.resolve(res);
        }
        if (choiceId === 'cancel') {
          this.setPrompt(null);
          if (this.state.turn.phase === 'play') {
            const cur = this.state.players[this.state.turn.index];
            this.log(`-- ${cur?.generalName ?? '角色'} 出牌阶段：可继续出牌、发动技能或结束回合`);
          }
          return Promise.resolve({ ok: true });
        }
      }
      if (prompt.skillAction === 'virtual_card_pick') {
        if (choiceId === 'cancel') {
          this.setPrompt(null);
          if (this.state.turn.phase === 'play') {
            const cur = this.state.players[this.state.turn.index];
            this.log(
              `—— ${cur?.generalName ?? '角色'} 出牌阶段：可选择出牌、发动技能或结束回合`,
            );
          }
          return Promise.resolve({ ok: true });
        }
        const match = choiceId.match(/^[^:]+:hand:(\d+)$/);
        if (!match) {
          return Promise.resolve({ ok: false, error: '无效选择' });
        }
        const handIndex = Number(match[1]);
        const cardName = prompt.cardName;
        if (!cardName) {
          return Promise.resolve({ ok: false, error: '技能配置错误' });
        }
        this.setPrompt(null);
        const res = this.cardPlay.initiatePlayCard(this, playerId, cardName, handIndex);
        if (res.ok) this.syncStackToState();
        return Promise.resolve(res);
      }
      if (prompt.skillId === 'zhaxiang') {
        const [choice, handIndexText] = choiceId.split(':hand:');
        const handIndex = handIndexText == null ? undefined : Number(handIndexText);
        const res = this.skillPlay.executeZhaxiang(this, playerId, choice, handIndex);
        if (res.ok) this.syncStackToState();
        return Promise.resolve(res);
      }
      if (prompt.skillId === 'yijue') {
        if (choiceId.startsWith('yijue:pindian:')) {
          const [, , targetId, sourceHandIndexText, targetHandIndexText] = choiceId.split(':');
          const res = this.skillPlay.executeYijuePindian(
            this,
            playerId,
            targetId ?? '',
            Number(sourceHandIndexText),
            Number(targetHandIndexText),
          );
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
        if (choiceId === 'yijue:recover' || choiceId === 'skip') {
          const res = this.skillPlay.executeYijueRecover(this, playerId, choiceId);
          if (res.ok) this.syncStackToState();
          return Promise.resolve(res);
        }
      }
      if (prompt.skillId === 'zhuhai') {
        if (choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.advanceToEnd();
          return { ok: true };
        }
        if (choiceId === 'skill:zhuhai') {
          return Promise.resolve(this.executeZhuhai(playerId));
        }
      }
      if (this.state.turn.phase === 'prepare') {
        if (prompt.skillId === 'wangzun') {
          return this.turnRunner.submitWangzun(
            playerId,
            prompt.id,
            choiceId === 'skill:wangzun',
          );
        }
        if (choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.startJudgePhase();
          return { ok: true };
        }
        if (choiceId.startsWith('skill:')) {
          const skillId = choiceId.slice(6);
          const currentPlayer = this.state.players[this.state.turn.index];
          if (!currentPlayer || currentPlayer.id !== playerId) {
            return { ok: false, error: '不是你的回合' };
          }
          const offers = collectOptionalSkillOffers(currentPlayer, GameTiming.TURN_START);
          const offer = offers.find((item) => item.skill.id === skillId);
          if (!offer) {
            return { ok: false, error: '当前时机不能发动此技能' };
          }
          if (skillId === 'tishen') {
            const lastTurnEndHp = currentPlayer.lastTurnEndHp;
            if (lastTurnEndHp == null || currentPlayer.hp >= lastTurnEndHp) {
              return { ok: false, error: '当前不满足【替身】发动条件' };
            }
            const recover = Math.min(currentPlayer.maxHp, lastTurnEndHp) - currentPlayer.hp;
            if (recover <= 0) {
              return { ok: false, error: '当前不满足【替身】发动条件' };
            }
            currentPlayer.hp += recover;
            const drawn = this.deck.drawMany(recover);
            currentPlayer.handCards.push(...drawn);
            this.afterPlayerGainedCards(currentPlayer, drawn);
            currentPlayer.usedLimitedSkills = {
              ...(currentPlayer.usedLimitedSkills ?? {}),
              tishen: true,
            };
            currentPlayer.skillUseCount[skillId] =
              (currentPlayer.skillUseCount[skillId] ?? 0) + 1;
            this.log(
              `${currentPlayer.generalName} 发动【${offer.skill.name}】，回复 ${recover} 点体力并摸 ${drawn.length} 张牌（${currentPlayer.hp}/${currentPlayer.maxHp}）`,
            );
            this.setPrompt(null);
            this.turnRunner.startJudgePhase();
            return { ok: true };
          }
          currentPlayer.skillUseCount[skillId] =
            (currentPlayer.skillUseCount[skillId] ?? 0) + 1;
          if (skillId === 'guanxing') {
            const aliveCount = this.state.players.filter((player) => player.hp > 0).length;
            const count = Math.min(5, aliveCount);
            const cards = this.deck.peekTop(count);
            this.setPrompt({
              id: nextPromptId(),
              type: 'use_skill',
              playerId,
              skillId: 'guanxing',
              skillName: offer.skill.name,
              guanxingCards: cards,
              message: `${currentPlayer.generalName} 发动【${offer.skill.name}】，请调整牌堆顶 ${cards.length} 张牌`,
              options: [{ id: 'guanxing:confirm', label: '确认观星' }],
            });
            return { ok: true };
          }
          if (skillId === 'luoshen') {
            currentPlayer.skillUseCount[skillId] = Math.max(
              0,
              (currentPlayer.skillUseCount[skillId] ?? 1) - 1,
            );
            return this.performLuoshen(currentPlayer);
          }
          runSkillEffects(currentPlayer, offer.skill, (message) => this.log(message), this.deck);
          this.setPrompt(null);
          this.turnRunner.startJudgePhase();
          return { ok: true };
        }
      }
      if (prompt.skillId === 'guanxing' && choiceId.startsWith('guanxing:confirm')) {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        const [, , topCountText, orderText] = choiceId.split(':');
        const originalCards = prompt.guanxingCards ?? [];
        const topCount = Math.max(0, Math.min(originalCards.length, Number(topCountText) || 0));
        const indices = (orderText ?? '')
          .split(',')
          .filter(Boolean)
          .map((value) => Number(value));
        if (
          indices.length !== originalCards.length ||
          new Set(indices).size !== originalCards.length ||
          indices.some((index) => index < 0 || index >= originalCards.length)
        ) {
          return { ok: false, error: '观星顺序无效' };
        }
        const arranged = indices.map((index) => originalCards[index]!);
        this.deck.arrangeTop(arranged, topCount);
        this.log(
          `${currentPlayer.generalName} 发动【观星】，将 ${topCount} 张置于牌堆顶，${arranged.length - topCount} 张置于牌堆底`,
        );
        this.setPrompt(null);
        this.turnRunner.startJudgePhase();
        return { ok: true };
      }
      if (prompt.skillId === 'luoshen') {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        if (choiceId === 'luoshen:continue') {
          return this.performLuoshen(currentPlayer);
        }
        if (choiceId === 'luoshen:stop' || choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.startJudgePhase();
          return { ok: true };
        }
      }
      if (prompt.skillId === 'xunxun' && choiceId.startsWith('xunxun:confirm')) {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        const [, , topCountText, orderText] = choiceId.split(':');
        const originalCards = prompt.guanxingCards ?? [];
        const topCount = Math.max(
          0,
          Math.min(originalCards.length, Number(topCountText) || 0),
        );
        const indices = (orderText ?? '')
          .split(',')
          .filter(Boolean)
          .map((value) => Number(value));
        if (
          indices.length !== originalCards.length ||
          new Set(indices).size !== originalCards.length ||
          indices.some((index) => index < 0 || index >= originalCards.length)
        ) {
          return { ok: false, error: '恂恂调整顺序无效' };
        }
        const arranged = indices.map((index) => originalCards[index]!);
        this.deck.arrangeTop(arranged, topCount);
        this.log(
          `${currentPlayer.generalName} 发动【恂恂】，将 ${topCount} 张置于牌堆顶，${arranged.length - topCount} 张置于牌堆底`,
        );
        this.setPrompt(null);
        this.turnRunner.performDraw();
        return { ok: true };
      }
      if (this.state.turn.phase === 'discard') {
        const currentPlayer = this.state.players[this.state.turn.index];
        if (!currentPlayer || currentPlayer.id !== playerId) {
          return { ok: false, error: '不是你的回合' };
        }
        if (choiceId === 'skip') {
          this.setPrompt(null);
          return this.turnRunner.performDiscardCheck();
        }
        if (choiceId === 'skill:keji') {
          if (currentPlayer.shaUsedCount > 0) {
            return { ok: false, error: '本回合使用过【杀】，不能发动【克己】' };
          }
          currentPlayer.skillUseCount.keji = (currentPlayer.skillUseCount.keji ?? 0) + 1;
          this.log(`${currentPlayer.generalName} 发动【克己】，跳过弃牌阶段`);
          this.setPrompt(null);
          this.turnRunner.finishTurnAfterDiscard();
          return { ok: true };
        }
        if (choiceId === 'skill:qinxue') {
          return this.turnRunner.performQinxue(playerId);
        }
        if (choiceId.startsWith('qinxue:')) {
          const handIndex = Number(choiceId.split(':')[1]);
          return this.turnRunner.performQinxue(playerId, handIndex);
        }
      }
      if (this.state.turn.phase === 'end') {
        const currentPlayer = this.state.players[this.state.turn.index];
        const isZhuhaiPrompt = prompt.skillId === 'zhuhai' && prompt.playerId === playerId;
        if (!isZhuhaiPrompt && (!currentPlayer || currentPlayer.id !== playerId)) {
          return { ok: false, error: '不是你的回合' };
        }
        if (choiceId === 'skip') {
          this.setPrompt(null);
          if (isZhuhaiPrompt) {
            this.turnRunner.advanceToEnd();
            return { ok: true };
          }
          return this.turnRunner.enterDiscardPhase();
        }
        if (choiceId === 'skill:zhuhai') {
          return Promise.resolve(this.executeZhuhai(playerId));
        }
        if (choiceId === 'skill:biyue') {
          const drawCount = currentPlayer.handCards.length === 0 ? 2 : 1;
          const drawn = this.deck.drawMany(drawCount);
          currentPlayer.handCards.push(...drawn);
          this.afterPlayerGainedCards(currentPlayer, drawn);
          currentPlayer.skillUseCount.biyue = (currentPlayer.skillUseCount.biyue ?? 0) + 1;
          this.log(
            `${currentPlayer.generalName} 发动【闭月】，摸 ${drawn.length} 张牌`,
          );
          this.setPrompt(null);
          return this.turnRunner.enterDiscardPhase();
        }
      }
      if (this.state.turn.phase === 'before_draw') {
        if (choiceId === 'skip') {
          this.setPrompt(null);
          this.turnRunner.performDraw();
          return { ok: true };
        }
        if (choiceId.startsWith('skill:')) {
          const skillId = choiceId.slice(6);
          const currentPlayer = this.state.players[this.state.turn.index];
          if (!currentPlayer || currentPlayer.id !== playerId) {
            return { ok: false, error: '不是你的回合' };
          }
          const offers = collectOptionalSkillOffers(currentPlayer, GameTiming.BEFORE_DRAW);
          const offer = offers.find((item) => item.skill.id === skillId);
          if (!offer) {
            return { ok: false, error: '当前时机不能发动此技能' };
          }
          currentPlayer.skillUseCount[skillId] =
            (currentPlayer.skillUseCount[skillId] ?? 0) + 1;

          // 恂恂：观看牌堆顶4张，选2张置顶、其余置底
          if (skillId === 'xunxun') {
            const count = (offer.skill.effects?.[0]?.params?.count as number) ?? 4;
            const arrangeTop = (offer.skill.effects?.[0]?.params?.arrange as number) ?? 2;
            const cards = this.deck.peekTop(count);
            this.log(`${currentPlayer.generalName} 发动【${offer.skill.name}】`);
            this.setPrompt({
              id: nextPromptId(),
              type: 'use_skill',
              playerId,
              skillId: 'xunxun',
              skillName: offer.skill.name,
              guanxingCards: cards,
              message: `${currentPlayer.generalName} 发动【${offer.skill.name}】，请将 ${arrangeTop} 张置于牌堆顶，其余置于牌堆底`,
              options: [{ id: 'xunxun:confirm', label: '确认调整' }],
            });
            return { ok: true };
          }

          if (skillId === 'tuxi') {
            const others = this.state.players.filter(
              (p) =>
                p.id !== currentPlayer.id &&
                p.hp > 0 &&
                !p.dead &&
                p.handCards.length > 0,
            );
            const stealCount = Math.min(2, others.length);
            for (let i = 0; i < stealCount; i++) {
              const target = others[i]!;
              const idx = Math.floor(Math.random() * target.handCards.length);
              const card = target.handCards.splice(idx, 1)[0]!;
              currentPlayer.handCards.push(card);
              this.afterPlayerGainedCards(currentPlayer, [card]);
              this.log(
                `${currentPlayer.generalName}【突袭】获得 ${target.generalName} 的一张手牌`,
              );
            }
            currentPlayer.skillUseCount['_tuxi_skip'] = stealCount;
            this.setPrompt(null);
            this.turnRunner.performDraw();
            return { ok: true };
          }

          this.log(`${currentPlayer.generalName} 发动【${offer.skill.name}】`);
          runSkillEffects(currentPlayer, offer.skill, (message) => this.log(message), this.deck);
          this.setPrompt(null);
          this.turnRunner.performDraw();
          return { ok: true };
        }
      }
      if (prompt.skillId && choiceId === `${prompt.skillId}:finish`) {
        return Promise.resolve(this.skillPlay.finish(this, playerId)).then(async (res) => {
          if (!res.ok || this.state.prompt) return res;
          await this.drainStack();
          await this.cardPlay.advanceAoeIfPending(this);
          return { ok: true };
        });
      }
      if (choiceId === 'cancel' && prompt.skillId) {
        this.setPrompt(null);
        if (this.state.turn.phase === 'play') {
          const cur = this.state.players[this.state.turn.index];
          this.log(
            `—— ${cur?.generalName ?? '角色'} 出牌阶段：可选择出牌、发动技能或结束回合`,
          );
        }
        return Promise.resolve({ ok: true });
      }
    }

    if (prompt.type === 'use_skill') {
      if (choiceId === 'skip') {
        this.rules.skipReactiveSkill({
          state: this.state,
          event: { id: '_', type: GameEventType.TAKE_DAMAGE, payload: {} },
          phase: 'post',
          log: (m) => this.log(m),
        });
        this.setPrompt(null);
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        return { ok: true };
      }
      if (choiceId.startsWith('skill:')) {
        const skillId = choiceId.slice(6);
        const event =
          (this.state.resolution.context.lastDamageEvent as GameEvent | undefined) ??
          this.stack.peek();
        if (skillId === 'yiji') {
          const player = this.state.players.find((item) => item.id === playerId);
          if (!player) return { ok: false, error: '角色不存在' };
          const drawn = this.deck.drawMany(2);
          player.handCards.push(...drawn);
          this.afterPlayerGainedCards(player, drawn);
          player.skillUseCount.yiji = (player.skillUseCount.yiji ?? 0) + 1;
          this.state.resolution.context.yijiPending = {
            playerId,
            givenCards: 0,
            targetIds: [],
          };
          const targets = this.state.players
            .filter((item) => item.id !== playerId && item.hp > 0 && !item.dead)
            .map((item) => item.id);
          this.log(`${player.generalName} 发动【遗计】，摸 ${drawn.length} 张牌`);
          this.setPrompt({
            id: nextPromptId(),
            type: 'use_skill',
            playerId,
            skillId: 'yiji',
            skillName: '遗计',
            skillAction: 'give_cards',
            characterSkills: characterSkillsForPrompt(player),
            message: '【遗计】：可将至多两张手牌分配给一至两名其他角色。',
            validTargetIds: targets,
            discardCount: 2,
            discardHandIndices: player.handCards.map((_, index) => index),
            options: [{ id: 'yiji:finish', label: '完成' }],
          });
          this.syncStackToState();
          return { ok: true };
        }
        if (event) {
          const paused = await this.rules.confirmReactiveSkill(
            {
              state: this.state,
              event,
              phase: 'post',
              log: (m) => this.log(m),
              deck: this.deck,
              setPrompt: (prompt) => this.setPrompt(prompt),
            },
            playerId,
            skillId,
          );
          if (paused) {
            this.syncStackToState();
            return { ok: true };
          }
        }
        this.setPrompt(null);
        this.syncStackToState();
        await this.drainStack();
        await this.cardPlay.advanceAoeIfPending(this);
        return { ok: true };
      }
    }

    if (prompt.type === 'dying_rescue') {
      return this.submitDyingRescue(playerId, promptId, choiceId);
    }

    if (prompt.type === 'pick_revealed') {
      const res = this.cardPlay.submitPickRevealed(this, playerId, promptId, choiceId);
      return Promise.resolve(res);
    }

    if (prompt.type === 'assign_revealed') {
      const res = this.submitYajiaoChoice(playerId, promptId, choiceId);
      if (!res.ok || this.state.prompt) return Promise.resolve(res);
      await this.drainStack();
      await this.cardPlay.advanceAoeIfPending(this);
      return { ok: true };
    }

    if (prompt.type === 'response') {
      return this.submitResponse(playerId, promptId, choiceId);
    }

    return { ok: false, error: '无效选择' };
  }

  submitResponse(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.state.prompt?.type === 'dying_rescue') {
      return this.submitDyingRescue(playerId, promptId, choiceId);
    }
    const shouldReturnToEndPhase =
      getCardPlayContext(this.state.resolution.context)?.returnToEndPhaseAfterResolve === true;
    return this.cardPlay.submitResponse(
      this,
      playerId,
      promptId,
      choiceId,
      (p) => this.applyDamage(p),
    ).then(async (res) => {
      if (!res.ok || this.state.prompt) return res;
      if (shouldReturnToEndPhase) {
        setCardPlayContext(this.state.resolution.context, undefined);
        this.turnRunner.advanceToEnd();
        this.promptPendingYajiao();
        return { ok: true };
      }
      await this.drainStack();
      await this.cardPlay.advanceAoeIfPending(this);
      this.promptPendingYajiao();
      return { ok: true };
    });
  }

  /** 伤害入栈并结算（含 AFTER_DAMAGE 与奸雄/反馈询问） */
  async applyDamage(params: {
    sourceId: string;
    targetId: string;
    amount: number;
    damageCardName?: string;
  }): Promise<void> {
    const event = createDamageEvent({
      id: nextEventId(),
      sourcePlayerId: params.sourceId,
      targetPlayerId: params.targetId,
      amount: params.amount,
      damageCardName: params.damageCardName,
    });
    this.stack.push(event);
    this.syncStackToState();
    await this.drainStack();
  }

  async onExecuteCore(event: GameEvent): Promise<void> {
    if (event.type === GameEventType.TARGET_RESOLVE) {
      const targetId = event.payload.targetPlayerIds?.[0];
      if (targetId) {
        this.cardPlay.resolveTargetResponse(this, targetId);
      }
      return;
    }

    if (event.type === GameEventType.TAKE_DAMAGE) {
      const sourceId = event.payload.sourcePlayerId;
      const source = sourceId
        ? this.state.players.find((p) => p.id === sourceId)
        : undefined;
      const targetIds = event.payload.targetPlayerIds ?? [];
      const victim = this.state.players.find((p) => targetIds.includes(p.id));
      const amount = event.payload.amount ?? 1;
      if (!victim || !source) return;

      this.rules.effects.runOne(
        { action: 'damage', params: { amount } },
        {
          state: this.state,
          event,
          source,
          targets: [victim],
          log: (m) => this.log(m),
          deck: this.deck,
        },
      );
      if (amount > 0) {
        source.skillUseCount._damage_dealt_this_turn =
          (source.skillUseCount._damage_dealt_this_turn ?? 0) + amount;
      }
      if (victim.hp <= 0) {
        this.state.lastDamageSourceId = sourceId ?? null;
        this.enqueueDying(victim.id);
      }
      this.resolveWangxiAfterDamage(source, victim, amount);
      this.resolveYaowuAfterDamage(
        source,
        victim,
        event.payload.damageCardName as string | undefined,
      );
      this.resolveQianxinAfterDamage(source);
      if (!this.state.prompt) {
        this.resolveQiaomengAfterDamage(source, victim, event);
      }
      if (!this.state.prompt) {
        this.resolveLiyuAfterDamage(source, victim, event);
      }
      return;
    }

    if (event.type === GameEventType.DYING) {
      const targetId = event.payload.targetPlayerIds?.[0];
      const dyingPlayer = this.state.players.find((player) => player.id === targetId);
      if (!dyingPlayer || dyingPlayer.hp > 0) return;
      this.log(`${dyingPlayer.generalName} 进入濒死`);
      this.beginDyingRescue(dyingPlayer.id);
    }
  }

  private resolveYaowuAfterDamage(
    source: EnginePlayerState,
    victim: EnginePlayerState,
    damageCardName?: string,
  ): void {
    if (!damageCardName || cardNameFromHandEntry(damageCardName) !== '杀') return;
    if (!playerHasSkill(victim, 'yaowu') || victim.hp <= 0 || victim.dead) return;

    const damageCard = createCardInstance(damageCardName);
    if (isRed(damageCard)) {
      if (source.hp < source.maxHp) {
        source.hp = Math.min(source.maxHp, source.hp + 1);
        this.log(
          `${victim.generalName} 触发【耀武】，${source.generalName} 回复 1 点体力（${source.hp}/${source.maxHp}）`,
        );
        return;
      }
      const drawn = this.deck.drawMany(1);
      source.handCards.push(...drawn);
      this.afterPlayerGainedCards(source, drawn);
      this.log(`${victim.generalName} 触发【耀武】，${source.generalName} 摸 ${drawn.length} 张牌`);
      return;
    }

    const drawn = this.deck.drawMany(1);
    victim.handCards.push(...drawn);
    this.afterPlayerGainedCards(victim, drawn);
    this.log(`${victim.generalName} 触发【耀武】，摸 ${drawn.length} 张牌`);
  }

  private beginDyingRescue(dyingPlayerId: string): void {
    const players = this.state.players;
    const dyingPlayer = players.find((player) => player.id === dyingPlayerId);
    if (!dyingPlayer || dyingPlayer.hp > 0) return;

    const turnIndex = Math.max(0, Math.min(this.state.turn.index, players.length - 1));
    const queue = players
      .slice(turnIndex)
      .concat(players.slice(0, turnIndex))
      .filter((player) => player.hp > 0 || player.id === dyingPlayerId)
      .map((player) => player.id);

    setDyingRescueContext(this.state.resolution.context, {
      dyingPlayerId,
      queue,
      index: 0,
    });
    this.promptNextDyingRescue();
  }

  private promptNextDyingRescue(): void {
    const context = getDyingRescueContext(this.state.resolution.context);
    if (!context) return;

    const dyingPlayer = this.state.players.find(
      (player) => player.id === context.dyingPlayerId,
    );
    if (!dyingPlayer || dyingPlayer.hp > 0) {
      setDyingRescueContext(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return;
    }

    while (context.index < context.queue.length) {
      const rescuerId = context.queue[context.index]!;
      const rescuer = this.state.players.find((player) => player.id === rescuerId);
      if (!rescuer || (rescuer.hp <= 0 && rescuer.id !== dyingPlayer.id)) {
        context.index += 1;
        continue;
      }

      const validCards = rescuer.handCards.filter((entry) => {
        const cardName = cardNameFromHandEntry(entry);
        return cardName === '桃' || (rescuer.id === dyingPlayer.id && cardName === '酒');
      });
      const canRespondJiuyuan = this.canRespondJiuyuan(rescuer, dyingPlayer);
      const currentTurnPlayer = this.state.players[this.state.turn.index];
      const isOutsideTurn = currentTurnPlayer?.id !== rescuer.id;
      const virtualTaoCards = isOutsideTurn
        ? validResponseCardsForPlayer(rescuer, 'tao', rescuer.handCards).filter(
            (entry) => !validCards.includes(entry),
          )
        : [];
      validCards.push(...virtualTaoCards);
      const options = validCards.map((card) => ({
        id: `card:${card}`,
        label: `使用【${cardNameFromHandEntry(card) === '桃' ? '桃' : '桃（急救）'}】`,
      }));

      this.setPrompt({
        id: nextPromptId(),
        type: 'dying_rescue',
        playerId: rescuer.id,
        dyingPlayerId: dyingPlayer.id,
        validResponseCards: validCards,
        message:
          rescuer.id === dyingPlayer.id
            ? `${dyingPlayer.generalName} 濒死：是否使用【桃】或【酒】自救？`
            : canRespondJiuyuan
            ? `${dyingPlayer.generalName} 濒死：${rescuer.generalName} 是否响应【救援】打出【桃】？`
            : `${dyingPlayer.generalName} 濒死：${rescuer.generalName} 是否使用【桃】救助？`,
        options: [...options, { id: 'pass', label: '不救' }],
      });
      setDyingRescueContext(this.state.resolution.context, context);
      return;
    }

    this.log(`${dyingPlayer.generalName} 未被救回，濒死结算结束`);
    setDyingRescueContext(this.state.resolution.context, undefined);
    this.clearDeferredAfterDamage(dyingPlayer.id);
    this.setPrompt(null);
    void this.handlePlayerDeath(dyingPlayer.id);
  }

  /** 濒死被救回后，补结算因 hp<=0 而延后的受伤后技能（奸雄/反馈等） */
  private async resumeAfterDamageSkills(victimId: string): Promise<void> {
    const deferredId = this.state.resolution.context.deferredAfterDamagePlayerId as
      | string
      | undefined;
    if (deferredId !== victimId) return;

    const event = this.state.resolution.context.lastDamageEvent as GameEvent | undefined;
    if (!event || event.type !== GameEventType.TAKE_DAMAGE) {
      this.clearDeferredAfterDamage(victimId);
      return;
    }
    const eventVictimId = event.payload.targetPlayerIds?.[0];
    if (eventVictimId !== victimId) return;

    const victim = this.state.players.find((player) => player.id === victimId);
    if (!victim || victim.hp <= 0 || victim.dead) {
      this.clearDeferredAfterDamage(victimId);
      return;
    }

    delete this.state.resolution.context.deferredAfterDamagePlayerId;

    await this.rules.emitForPlayersWithSkills(
      {
        state: this.state,
        event,
        phase: 'post',
        ownerPlayerId: victimId,
        log: (message) => this.log(message),
        deck: this.deck,
        setPrompt: (prompt) => this.setPrompt(prompt),
      },
      GameTiming.AFTER_DAMAGE,
    );
  }

  private clearDeferredAfterDamage(victimId: string): void {
    const deferredId = this.state.resolution.context.deferredAfterDamagePlayerId as
      | string
      | undefined;
    if (deferredId === victimId) {
      delete this.state.resolution.context.deferredAfterDamagePlayerId;
    }
    const event = this.state.resolution.context.lastDamageEvent as GameEvent | undefined;
    if (event?.type === GameEventType.TAKE_DAMAGE && event.payload.targetPlayerIds?.[0] === victimId) {
      delete this.state.resolution.context.lastDamageEvent;
    }
  }

  /** 角色死亡：公开身份、弃置所有牌、击杀奖惩、胜负判定 */
  private async handlePlayerDeath(playerId: string): Promise<void> {
    if (this.state.victory) return;
    const victim = this.state.players.find((p) => p.id === playerId);
    if (!victim || victim.dead) return;
    if (victim.hp > 0) return;

    this.clearDeferredAfterDamage(playerId);

    victim.dead = true;
    victim.roleRevealed = true;
    this.log(`【阵亡】${victim.generalName}（${victim.role}）死亡，身份公开`);

    for (const card of victim.handCards.splice(0)) {
      this.deck.discardCard(card);
    }
    while (victim.equipment.length > 0) {
      discardOneFromZone(victim, 'equipment', this.deck, (m) => this.log(m));
    }
    while (victim.judgeCards.length > 0) {
      discardOneFromZone(victim, 'any', this.deck, (m) => this.log(m));
    }

    const killerId = this.state.lastDamageSourceId;
    const killer = killerId
      ? this.state.players.find((p) => p.id === killerId && p.hp > 0)
      : undefined;
    if (killer && victim.role === '反贼') {
      const drawn = this.deck.drawMany(3);
      killer.handCards.push(...drawn);
      this.afterPlayerGainedCards(killer, drawn);
      this.log(`${killer.generalName} 击杀反贼，摸 3 张牌`);
    }
    if (killer?.role === '主公' && victim.role === '忠臣') {
      while (killer.handCards.length > 0) {
        this.deck.discardCard(killer.handCards.pop()!);
      }
      while (killer.equipment.length > 0) {
        discardOneFromZone(killer, 'equipment', this.deck, (m) => this.log(m));
      }
      this.log(`主公 ${killer.generalName} 误杀忠臣，弃置所有手牌和装备`);
    }

    const result = checkVictory(this.state.players);
    if (result) {
      this.state.victory = { winners: result.winners, message: result.message };
      this.log(`【游戏结束】${result.message}`);
      this.setPrompt(null);
      return;
    }

    await this.drainStack();
    await this.cardPlay.advanceAoeIfPending(this);
  }

  isGameOver(): boolean {
    return !!this.state.victory;
  }

  private async submitDyingRescue(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const prompt = this.state.prompt;
    const context = getDyingRescueContext(this.state.resolution.context);
    if (!prompt || prompt.id !== promptId || !context) {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'dying_rescue' || prompt.playerId !== playerId) {
      return { ok: false, error: '当前不能由你救助' };
    }

    const rescuer = this.state.players.find((player) => player.id === playerId);
    const dyingPlayer = this.state.players.find(
      (player) => player.id === context.dyingPlayerId,
    );
    if (!rescuer || !dyingPlayer) {
      setDyingRescueContext(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }

    if (choiceId.startsWith('card:')) {
      const cardEntry = choiceId.slice(5);
      const cardName = cardNameFromHandEntry(cardEntry);
      const currentTurnPlayer = this.state.players[this.state.turn.index];
      const isOutsideTurn = currentTurnPlayer?.id !== rescuer.id;
      const isJijiuTao =
        isOutsideTurn &&
        validResponseCardsForPlayer(rescuer, 'tao', [cardEntry]).includes(cardEntry);
      if (cardName !== '桃' && !(rescuer.id === dyingPlayer.id && cardName === '酒') && !isJijiuTao) {
        return { ok: false, error: '此牌不能用于当前救助' };
      }
      const removed = isJijiuTao
        ? removeCardFromHand(rescuer, cardName, rescuer.handCards.indexOf(cardEntry))
        : removeCardFromHand(rescuer, cardName);
      if (!removed) {
        return { ok: false, error: '手牌中没有此牌' };
      }
      this.deck.discardCard(cardEntry);
      dyingPlayer.hp = Math.min(dyingPlayer.maxHp, dyingPlayer.hp + 1);
      const isJiuyuanTao = this.canRespondJiuyuan(rescuer, dyingPlayer);
      if (isJiuyuanTao) {
        dyingPlayer.skillUseCount.jiuyuan = (dyingPlayer.skillUseCount.jiuyuan ?? 0) + 1;
      }
      this.log(
        rescuer.id === dyingPlayer.id
          ? `${dyingPlayer.generalName} 使用【${cardName}】自救（${dyingPlayer.hp}/${dyingPlayer.maxHp}）`
          : isJiuyuanTao
          ? `${rescuer.generalName} 响应【救援】，替 ${dyingPlayer.generalName} 打出【桃】（${dyingPlayer.hp}/${dyingPlayer.maxHp}）`
          : `${rescuer.generalName} 对 ${dyingPlayer.generalName} 使用【${isJijiuTao && cardName !== '桃' ? '桃（急救）' : '桃'}】（${dyingPlayer.hp}/${dyingPlayer.maxHp}）`,
      );
      if (dyingPlayer.hp > 0) {
        setDyingRescueContext(this.state.resolution.context, undefined);
        this.setPrompt(null);
        await this.resumeAfterDamageSkills(dyingPlayer.id);
        if (!this.state.prompt) {
          await this.drainStack();
          await this.cardPlay.advanceAoeIfPending(this);
        }
        return { ok: true };
      }
    } else if (choiceId === 'pass') {
      this.log(`${rescuer.generalName} 放弃救助 ${dyingPlayer.generalName}`);
    } else {
      return { ok: false, error: '无效选择' };
    }

    context.index += 1;
    setDyingRescueContext(this.state.resolution.context, context);
    this.promptNextDyingRescue();
    if (!this.state.prompt) {
      await this.drainStack();
      await this.cardPlay.advanceAoeIfPending(this);
    }
    return { ok: true };
  }

  private canRespondJiuyuan(
    rescuer: EnginePlayerState,
    dyingPlayer: EnginePlayerState,
  ): boolean {
    return (
      rescuer.id !== dyingPlayer.id &&
      dyingPlayer.role === '主公' &&
      playerHasSkill(dyingPlayer, 'jiuyuan') &&
      rescuer.kingdom === 'wu' &&
      rescuer.hp > 0 &&
      !rescuer.dead
    );
  }

  scheduleAoeTargets(sourcePlayerId: string, targetPlayerIds: string[]): void {
    this.targetQueue = new TargetQueue(targetPlayerIds);
    this.state.resolution.targetQueue = [...targetPlayerIds];
    this.pushNextAoeTargetEvent(sourcePlayerId);
  }

  /** 当前 TARGET_RESOLVE 响应完毕：出栈并调度下一目标 */
  completeTargetResolve(): void {
    const event = this.stack.peek();
    if (event?.type !== GameEventType.TARGET_RESOLVE) return;
    this.stack.pop();
    const sourceId = event.payload.sourcePlayerId;
    if (this.targetQueue) {
      this.targetQueue.shift();
      if (sourceId) this.pushNextAoeTargetEvent(sourceId);
    }
    this.syncStackToState();
  }

  private pushNextAoeTargetEvent(sourcePlayerId: string): void {
    if (this.targetQueue && !this.targetQueue.isEmpty) {
      const targetId = this.targetQueue.peek()!;
      this.stack.push({
        id: nextEventId(),
        type: GameEventType.TARGET_RESOLVE,
        payload: { sourcePlayerId, targetPlayerIds: [targetId] },
      });
      this.syncStackToState();
      return;
    }
    this.state.resolution.targetQueue = null;
    this.targetQueue = null;
  }

  async drainStack(): Promise<{ paused: boolean }> {
    while (this.stack.depth > 0) {
      if (this.state.prompt) return { paused: true };

      const event = this.stack.peek();
      if (!event) break;

      const result = await this.resolver.resolve(this, event);
      if (result.executeFinished && this.stack.peek() !== event) {
        if (event.type === GameEventType.TAKE_DAMAGE) {
          this.state.resolution.context.lastDamageEvent = { ...event };
        }
        this.stack.remove(event.id);
        this.syncStackToState();
      } else if (result.executeFinished) {
        if (event.type === GameEventType.TAKE_DAMAGE) {
          this.state.resolution.context.lastDamageEvent = { ...event };
        }
        this.stack.pop();
        this.syncStackToState();
      }
      if (this.state.prompt || result.paused) return { paused: true };

      if (!result.executeFinished) {
        continue;
      }
    }
    return { paused: false };
  }

  enqueueDying(playerId: string): void {
    this.stack.pushUrgent({
      id: nextEventId(),
      type: GameEventType.DYING,
      payload: { targetPlayerIds: [playerId] },
      insertPriority: 1000,
    });
    this.syncStackToState();
  }

  endTurn(sourceId: string): { ok: boolean; error?: string } {
    if (this.state.prompt) {
      return {
        ok: false,
        error:
          this.state.prompt.type === 'discard_cards'
            ? '请先完成弃牌'
            : '请先处理当前提示',
      };
    }
    return this.turnRunner.endPlayPhase(sourceId);
  }

  initiateSkill(sourceId: string, skillId: string): { ok: boolean; error?: string } {
    return this.skillPlay.initiate(this, sourceId, skillId);
  }

  rendeGive(
    sourceId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): { ok: boolean; error?: string } {
    return this.skillPlay.giveCards(this, sourceId, targetId, cards, handIndices);
  }

  qingnangRecover(
    sourceId: string,
    targetId: string,
    handIndices: number | number[],
  ): { ok: boolean; error?: string } {
    const result = this.skillPlay.discardRecover(this, sourceId, targetId, handIndices);
    if (result.ok) this.syncStackToState();
    return result;
  }

  rendeFinish(sourceId: string): { ok: boolean; error?: string } {
    return this.skillPlay.finish(this, sourceId);
  }

  zhihengConfirm(_sourceId: string, _handIndices: number[]): { ok: boolean; error?: string } {
    const currentPlayer = this.state.players[this.state.turn.index];
    if (!currentPlayer || currentPlayer.id !== _sourceId) {
      return { ok: false, error: '不是你的回合' };
    }
    if (this.state.prompt?.skillId !== 'zhiheng') {
      return { ok: false, error: '当前未在制衡流程中' };
    }
    if (_handIndices.length === 0) {
      return { ok: false, error: '请至少选择一张手牌' };
    }

    const sorted = [..._handIndices].sort((left, right) => right - left);
    if (new Set(sorted).size !== _handIndices.length) {
      return { ok: false, error: '不能重复选择同一张手牌' };
    }

    const discarded: string[] = [];
    for (const index of sorted) {
      if (index < 0 || index >= currentPlayer.handCards.length) {
        return { ok: false, error: '所选手牌无效' };
      }
      const card = currentPlayer.handCards[index]!;
      currentPlayer.handCards.splice(index, 1);
      this.deck.discardCard(card);
      discarded.push(card);
    }

    const drawn = this.deck.drawMany(discarded.length);
    currentPlayer.handCards.push(...drawn);
    this.afterPlayerGainedCards(currentPlayer, drawn);
    currentPlayer.skillUseCount.zhiheng =
      (currentPlayer.skillUseCount.zhiheng ?? 0) + 1;

    this.log(
      `${currentPlayer.generalName} 发动【制衡】，弃置 ${discarded.join('、')}，摸 ${drawn.length} 张牌`,
    );
    this.setPrompt(null);
    this.log(`-- ${currentPlayer.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    return { ok: true };
  }

  submitModifyJudge(
    sourceId: string,
    promptId: string,
    handIndex: number,
    handCardEntry?: string,
  ): { ok: boolean; error?: string } {
    return this.turnRunner.submitModifyJudge(sourceId, promptId, handIndex, handCardEntry);
  }

  skipModifyJudge(sourceId: string, promptId: string): { ok: boolean; error?: string } {
    return this.turnRunner.skipModifyJudge(sourceId, promptId);
  }

  submitDiscard(
    sourceId: string,
    promptId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    return this.turnRunner.submitDiscard(sourceId, promptId, handIndices);
  }

  cancelDiscard(sourceId: string, promptId: string): { ok: boolean; error?: string } {
    return this.turnRunner.cancelDiscard(sourceId, promptId);
  }

  async submitZoneCard(
    sourceId: string,
    promptId: string,
    choiceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const prompt = this.state.prompt;
    if (prompt?.skillId === 'ganglie') {
      const res = this.submitGanglieZoneCard(sourceId, promptId, choiceId);
      if (res.ok) {
        this.syncStackToState();
        await this.drainStack();
      }
      return res;
    }
    const res = this.cardPlay.submitZoneCardSelection(
      this,
      sourceId,
      promptId,
      choiceId,
    );
    this.syncStackToState();
    return res;
  }

  private submitGanglieZoneCard(
    pickerId: string,
    promptId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const prompt = this.state.prompt;
    const zonePick = getZonePickContext(this.state.resolution.context);
    if (!prompt || prompt.id !== promptId || !zonePick || prompt.skillId !== 'ganglie') {
      return { ok: false, error: '提示已失效' };
    }
    if (prompt.type !== 'select_zone_card' || prompt.playerId !== pickerId) {
      return { ok: false, error: '当前不能选牌' };
    }

    const parsed = parseZoneCardId(choiceId);
    if (!parsed) return { ok: false, error: '请选择一张牌' };

    const picker = this.state.players.find((player) => player.id === zonePick.sourcePlayerId);
    const target = this.state.players.find((player) => player.id === zonePick.targetPlayerId);
    if (!picker || !target) {
      setZonePickContext(this.state.resolution.context, undefined);
      this.setPrompt(null);
      return { ok: false, error: '状态错误' };
    }
    if (!canDiscardZoneCard(picker, target, parsed.zone, parsed.index)) {
      return { ok: false, error: '所选牌无效' };
    }

    let removed: string | undefined;
    if (parsed.zone === 'hand') {
      if (parsed.index < 0 || parsed.index >= target.handCards.length) {
        return { ok: false, error: '所选牌无效' };
      }
      removed = target.handCards.splice(parsed.index, 1)[0];
      this.afterPlayerLostHandCards(target, 1);
    } else if (parsed.zone === 'equipment') {
      if (parsed.index < 0 || parsed.index >= target.equipment.length) {
        return { ok: false, error: '所选牌无效' };
      }
      removed = target.equipment.splice(parsed.index, 1)[0];
      this.afterPlayerLostEquipmentCards(target, 1);
    } else {
      if (parsed.index < 0 || parsed.index >= target.judgeCards.length) {
        return { ok: false, error: '所选牌无效' };
      }
      removed = target.judgeCards.splice(parsed.index, 1)[0];
    }

    if (!removed) return { ok: false, error: '所选牌无效' };
    this.deck.discardCard(removed);
    if (parsed.zone === 'equipment') {
      this.log(`${picker.generalName} 弃置 ${target.generalName} 的装备【${removed}】`);
    } else if (parsed.zone === 'judge') {
      this.log(`${picker.generalName} 弃置 ${target.generalName} 的判定区【${removed}】`);
    } else {
      this.log(
        `${picker.generalName} 弃置 ${target.generalName} 的${formatHandEntryForLog(removed)}`,
      );
    }

    setZonePickContext(this.state.resolution.context, undefined);
    this.setPrompt(null);
    return { ok: true };
  }

  submitQianxun(
    sourceId: string,
    promptId: string,
    handIndices: number[],
  ): { ok: boolean; error?: string } {
    const res = this.cardPlay.submitQianxun(
      this,
      sourceId,
      promptId,
      'skill:qianxun',
      handIndices,
    );
    this.syncStackToState();
    return res;
  }

  submitLiuli(
    sourceId: string,
    promptId: string,
    redirectTargetId: string,
    zoneCardId: string,
  ): { ok: boolean; error?: string } {
    const res = this.cardPlay.submitLiuli(
      this,
      sourceId,
      promptId,
      'skill:liuli',
      redirectTargetId,
      zoneCardId,
    );
    this.syncStackToState();
    return res;
  }

  submitQiaomengChoice(
    sourceId: string,
    promptId: string,
    equipmentIndex: number,
  ): { ok: boolean; error?: string } {
    const res = this.submitQiaomeng(sourceId, promptId, `qiaomeng:${equipmentIndex}`);
    this.syncStackToState();
    return res;
  }

  /** 断线重连：将引擎内玩家 id 从旧 socket id 迁移到新 id */
  remapPlayerId(oldId: string, newId: string): void {
    if (oldId === newId) return;

    const player = this.state.players.find((p) => p.id === oldId);
    if (player) player.id = newId;

    const prompt = this.state.prompt;
    if (prompt) {
      if (prompt.playerId === oldId) prompt.playerId = newId;
      if (prompt.sourcePlayerId === oldId) prompt.sourcePlayerId = newId;
      if (prompt.judgeTargetId === oldId) prompt.judgeTargetId = newId;
      if (prompt.targetPlayerIds) {
        prompt.targetPlayerIds = prompt.targetPlayerIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
      if (prompt.validTargetIds) {
        prompt.validTargetIds = prompt.validTargetIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
    }

    const ctx = this.state.resolution.context;
    const cardPlay = getCardPlayContext(ctx);
    if (cardPlay) {
      if (cardPlay.sourcePlayerId === oldId) cardPlay.sourcePlayerId = newId;
      if (cardPlay.awaitingResponseFrom === oldId) {
        cardPlay.awaitingResponseFrom = newId;
      }
      cardPlay.targetPlayerIds = cardPlay.targetPlayerIds.map((id) =>
        id === oldId ? newId : id,
      );
      setCardPlayContext(ctx, cardPlay);
    }

    const zonePick = getZonePickContext(ctx);
    if (zonePick) {
      if (zonePick.sourcePlayerId === oldId) zonePick.sourcePlayerId = newId;
      if (zonePick.targetPlayerId === oldId) zonePick.targetPlayerId = newId;
      setZonePickContext(ctx, zonePick);
    }

    const pending = ctx.pendingReactive as
      | { playerId: string; eventId: string; skillId: string }
      | undefined;
    if (pending?.playerId === oldId) pending.playerId = newId;

    if (this.state.resolution.targetQueue) {
      this.state.resolution.targetQueue = this.state.resolution.targetQueue.map(
        (id) => (id === oldId ? newId : id),
      );
    }

    if (this.pendingJudge?.targetPlayerId === oldId) {
      this.pendingJudge = { ...this.pendingJudge, targetPlayerId: newId };
    }

    for (const event of this.stack.toArray()) {
      if (event.payload.sourcePlayerId === oldId) {
        event.payload.sourcePlayerId = newId;
      }
      if (event.payload.targetPlayerIds) {
        event.payload.targetPlayerIds = event.payload.targetPlayerIds.map((id) =>
          id === oldId ? newId : id,
        );
      }
    }
    this.syncStackToState();
  }

  private syncStackToState(): void {
    this.state.resolution.stack = [...this.stack.toArray()];
    this.state.deck.remaining = this.deck.remaining();
    this.state.discardPile = this.deck.discardPile();
  }
}
