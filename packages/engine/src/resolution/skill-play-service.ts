import { CardRegistry } from '../registry/card-registry';
import { CharacterRegistry } from '../registry/character-registry';
import type { EffectDefinition } from '../types/card';
import type { GameState } from '../state/game-state';
import type { DeckPile } from '../engine/deck-pile';
import { applyLockedModifiers, characterSkillsForPrompt } from '../engine/timing-runner';
import { handEntriesMatch } from '../engine/card-label';
import { discardZoneCard, listZoneCards, parseZoneCardId, takeZoneCard } from '../engine/zone-card-pick';
import { validResponseCardsForPlayer } from '../engine/virtual-card';
import { setCardPlayContext } from './card-play-context';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { SkillDefinition } from '../types/skill';
import { GameTiming } from '../types/timing';
import { nextPromptId } from '../utils/prompt-id';

export interface SkillPlayHost {
  getState(): GameState;
  log(message: string): void;
  setPrompt(prompt: GamePrompt | null): void;
  getDeck?: () => DeckPile;
  afterPlayerGainedCards?(player: EnginePlayerState, gainedCards: string[]): void;
  afterPlayerLostHandCards?(player: EnginePlayerState, lostCount: number): void;
  afterPlayerLostEquipmentCards?(player: EnginePlayerState, lostCount: number): void;
}

function isAutoCloseGiveSkill(skillId: string): boolean {
  return skillId === 'rende';
}

function filterAvailableTargetsForSkill(
  source: EnginePlayerState,
  skillId: string,
  targetIds: string[],
): string[] {
  if (skillId !== 'rende' && skillId !== 'qingnang') {
    return targetIds;
  }
  const usedTargets = new Set(source.skillTargetUseCount[skillId] ?? []);
  return targetIds.filter((targetId) => !usedTargets.has(targetId));
}

function isMaleCharacter(player: EnginePlayerState): boolean {
  const femaleGenerals = new Set(['甄姬', '孙尚香', '界孙尚香', '界大乔', '大乔', '界貂蝉', '貂蝉']);
  return !femaleGenerals.has(player.generalName);
}

function isRedCard(cardName: string): boolean {
  return cardName.includes('♥') || cardName.includes('♦');
}

function suitOf(entry: string): '♠' | '♥' | '♣' | '♦' | undefined {
  const suit = entry.trim()[0];
  return suit === '♠' || suit === '♥' || suit === '♣' || suit === '♦' ? suit : undefined;
}

function pointOf(entry: string): number {
  const parsed = entry.trim().match(/^[♠♥♣♦](\d{1,2})【.+】$/);
  const value = parsed ? Number(parsed[1]) : 1;
  return Number.isFinite(value) ? value : 1;
}

function effectParams<T extends Record<string, unknown>>(effect: EffectDefinition | undefined): T {
  return (effect?.params ?? {}) as T;
}

function firstOtherAliveTarget(state: GameState, sourceId: string): EnginePlayerState | undefined {
  return state.players.find((player) => player.id !== sourceId && player.hp > 0 && !player.dead);
}

function randomHandIndex(player: EnginePlayerState): number {
  return Math.max(0, player.handCards.length - 1);
}

export class SkillPlayService {
  private findSkill(player: EnginePlayerState, skillId: string): SkillDefinition | undefined {
    if (skillId === 'jianyan' && player.usedLimitedSkills?.qianxin) {
      return {
        id: 'jianyan',
        name: '荐言',
        characterId: 'jie_xushu',
        type: 'active',
        description:
          '出牌阶段限一次，你可以声明一种牌的类别或颜色，亮出牌堆顶符合声明的第一张牌并交给一名男性角色。',
        timings: [GameTiming.PHASE_PLAY],
        limitPerTurn: 1,
      };
    }

    const character = CharacterRegistry.resolve(player.generalName);
    return character?.skills.find(
      (skill) =>
        skill.id === skillId &&
        (!player.skillUseCount._yijue_non_locked_disabled || skill.type === 'locked'),
    );
  }

  private promptZhaxiangAfterHpLoss(host: SkillPlayHost, source: EnginePlayerState): boolean {
    if (!this.findSkill(source, 'zhaxiang')) return false;
    if (source.hp !== 1 || source.dead || source.hp <= 0) return false;
    const redHandIndices = source.handCards
      .map((card, index) => (isRedCard(card) ? index : -1))
      .filter((index) => index >= 0);
    if (redHandIndices.length === 0) return false;

    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: source.id,
      skillId: 'zhaxiang',
      skillName: '诈降',
      skillAction: 'discard_red_then_choose',
      characterSkills: characterSkillsForPrompt(source),
      message: `【诈降】：当前体力为 1，可弃置一张红色手牌并选择回复 1 点体力或摸两张牌。`,
      discardCount: 1,
      discardHandIndices: redHandIndices,
      options: [
        { id: 'zhaxiang:recover', label: '弃红牌并回复' },
        { id: 'zhaxiang:draw', label: '弃红牌并摸牌' },
        { id: 'skip', label: '不发动' },
      ],
    });
    return true;
  }

  initiate(
    host: SkillPlayHost,
    sourceId: string,
    skillId: string,
  ): { ok: boolean; error?: string } {
    if (host.getState().prompt) {
      return { ok: false, error: '请先处理当前提示' };
    }

    const source = host.getState().players.find((player) => player.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }

    const currentPlayer = host.getState().players[host.getState().turn.index];
    if (!currentPlayer || currentPlayer.id !== sourceId) {
      return { ok: false, error: '不是你的回合' };
    }

    const skill = this.findSkill(source, skillId);
    if (!skill) return { ok: false, error: '技能不存在' };
    if (!skill.timings.includes(GameTiming.PHASE_PLAY)) {
      return { ok: false, error: '当前时机不能发动此技能' };
    }
    if (
      skill.limitPerTurn != null &&
      (source.skillUseCount[skillId] ?? 0) >= skill.limitPerTurn
    ) {
      return { ok: false, error: '本回合该技能已用完' };
    }

    const giveEffect = skill.effects?.find((effect) => effect.action === 'giveCards');
    if (giveEffect) {
      const others = filterAvailableTargetsForSkill(
        source,
        skillId,
        host
          .getState()
          .players.filter((player) => player.id !== sourceId && player.hp > 0)
          .map((player) => player.id),
      );
      if (others.length === 0) {
        return { ok: false, error: '没有合法的目标角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(source),
        message: isAutoCloseGiveSkill(skillId)
          ? `【${skill.name}】：选择一名其他角色并给出手牌。`
          : `【${skill.name}】：选择一名其他角色并给出手牌，可多次给出直到点击“完成”。`,
        validTargetIds: others,
        autoCloseAfterSubmit: isAutoCloseGiveSkill(skillId),
        options: isAutoCloseGiveSkill(skillId)
          ? [{ id: 'cancel', label: '取消' }]
          : [
              { id: `${skillId}:finish`, label: `完成${skill.name}` },
              { id: 'cancel', label: '取消' },
            ],
      });
      return { ok: true };
    }

    if (skillId === 'qingnang' || skillId === 'jieyin') {
      const discardCount = skillId === 'jieyin' ? 2 : 1;
      if (source.handCards.length < discardCount) {
        return {
          ok: false,
          error: discardCount === 1 ? '手牌为空，无法发动此技能' : '手牌不足，无法发动此技能',
        };
      }
      const targets = filterAvailableTargetsForSkill(
        source,
        skillId,
        host
          .getState()
          .players.filter(
            (player) =>
              player.hp > 0 &&
              player.hp < player.maxHp &&
              (skillId !== 'jieyin' || (player.id !== sourceId && isMaleCharacter(player))),
          )
          .map((player) => player.id),
      );
      if (targets.length === 0) {
        return { ok: false, error: '没有需要回复的合法目标角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        skillAction: 'discard_recover',
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：弃置 ${discardCount} 张手牌，令一名角色回复 1 点体力。`,
        validTargetIds: targets,
        discardCount,
        discardHandIndices: source.handCards.map((_, index) => index),
        options: [{ id: 'cancel', label: '取消' }],
      });
      return { ok: true };
    }

    if (skillId === 'kurou') {
      if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };
      if (source.hp <= 1) {
        return { ok: false, error: '当前体力不足，不能发动【苦肉】' };
      }
      source.hp -= 1;
      const drawn = host.getDeck().drawMany(2);
      source.handCards.push(...drawn);
      source.skillUseCount.kurou = (source.skillUseCount.kurou ?? 0) + 1;
      host.log(
        `${source.generalName} 发动【苦肉】，失去 1 点体力并摸 ${drawn.length} 张牌（${source.hp}/${source.maxHp}）`,
      );
      if (this.promptZhaxiangAfterHpLoss(host, source)) {
        return { ok: true };
      }
      host.setPrompt(null);
      host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
      return { ok: true };
    }

    const discardEffect = skill.effects?.find(
      (effect) =>
        effect.action === 'discard' &&
        effect.params?.zone === 'hand' &&
        effect.params?.chooseCount,
    );
    if (discardEffect) {
      if (source.handCards.length === 0) {
        return { ok: false, error: '手牌为空，无法发动此技能' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：请选择至少一张手牌弃置，然后摸等量的牌。`,
        options: [
          { id: `${skillId}:confirm`, label: `确认${skill.name}` },
          { id: 'cancel', label: '取消' },
        ],
      });
      return { ok: true };
    }

    if (skillId === 'jianyan') {
      const targets = host
        .getState()
        .players.filter((player) => player.id !== sourceId && player.hp > 0)
        .map((player) => player.id);
      if (targets.length === 0) {
        return { ok: false, error: '没有合法的目标角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：请选择一名目标角色，再声明颜色或类别。`,
        validTargetIds: targets,
        options: [
          { id: 'jianyan:red', label: '声明红色' },
          { id: 'jianyan:black', label: '声明黑色' },
          { id: 'jianyan:basic', label: '声明基本牌' },
          { id: 'jianyan:trick', label: '声明锦囊牌' },
          { id: 'jianyan:equipment', label: '声明装备牌' },
          { id: 'cancel', label: '取消' },
        ],
      });
      return { ok: true };
    }

    if (skillId === 'fanjian') {
      if (source.handCards.length === 0) {
        return { ok: false, error: '手牌为空，无法发动此技能' };
      }
      const targets = host
        .getState()
        .players.filter((player) => player.id !== sourceId && player.hp > 0 && !player.dead)
        .map((player) => player.id);
      if (targets.length === 0) {
        return { ok: false, error: '没有合法的目标角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        skillAction: 'target_choice',
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：选择一名目标角色并交给其一张手牌。`,
        validTargetIds: targets,
        discardHandIndices: source.handCards.map((_, index) => index),
        options: [{ id: 'cancel', label: '取消' }],
      });
      return { ok: true };
    }

    if (skillId === 'lijian') {
      if (source.handCards.length + source.equipment.length === 0) {
        return { ok: false, error: '没有可弃置的牌，无法发动此技能' };
      }
      const targets = host
        .getState()
        .players.filter(
          (player) =>
            player.id !== sourceId && player.hp > 0 && !player.dead && isMaleCharacter(player),
        )
        .map((player) => player.id);
      if (targets.length < 2) {
        return { ok: false, error: '男性角色不足，无法发动【离间】' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        skillAction: 'discard_card_target_pair',
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：弃置一张牌，选择一名男性角色视为对另一名男性角色使用【决斗】。`,
        validTargetIds: targets,
        skillCardOptions: listZoneCards(source, { hideHand: false, shuffleHand: false })
          .filter((option) => option.zone !== 'judge')
          .map((option) => ({ id: option.id, label: option.label })),
        options: [{ id: 'cancel', label: '取消' }],
      });
      return { ok: true };
    }

    if (skillId === 'yijue') {
      if (source.handCards.length === 0) {
        return { ok: false, error: '手牌为空，无法发动此技能' };
      }
      const targets = host
        .getState()
        .players.filter(
          (player) =>
            player.id !== sourceId && player.hp > 0 && !player.dead && player.handCards.length > 0,
        )
        .map((player) => player.id);
      if (targets.length === 0) {
        return { ok: false, error: '没有可拼点的目标角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        skillAction: 'pindian',
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：选择一名有手牌的角色，并选择一张手牌拼点。`,
        validTargetIds: targets,
        discardHandIndices: source.handCards.map((_, index) => index),
        options: [{ id: 'cancel', label: '取消' }],
      });
      return { ok: true };
    }

    return this.executeGenericActiveSkill(host, source, skill);
  }

  private executeGenericActiveSkill(
    host: SkillPlayHost,
    source: EnginePlayerState,
    skill: SkillDefinition,
  ): { ok: boolean; error?: string } {
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };
    const state = host.getState();
    const deck = host.getDeck();
    const firstEffect = skill.effects?.[0];
    const firstParams = effectParams(firstEffect);

    if (firstEffect?.action === 'useVirtualCard') {
      const as = String(firstParams.as ?? '虚拟牌');
      source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
      host.log(`${source.generalName} 发动【${skill.name}】，视为使用【${as}】`);
      host.setPrompt(null);
      return { ok: true };
    }

    if (firstEffect?.action === 'showCard') {
      const count = Number(firstParams.count ?? 1);
      const revealed = deck.peekTop(Math.max(1, count));
      const target = firstOtherAliveTarget(state, source.id);
      if (firstParams.giveAndChoose && target) {
        if (source.handCards.length === 0) return { ok: false, error: '手牌为空，无法发动此技能' };
        const card = source.handCards.splice(randomHandIndex(source), 1)[0]!;
        target.handCards.push(card);
        host.log(`${source.generalName} 发动【${skill.name}】，交给 ${target.generalName} 一张手牌`);
      } else if (firstParams.declareType && target) {
        const card = deck.drawOne();
        if (card) target.handCards.push(card);
        host.log(`${source.generalName} 发动【${skill.name}】，亮出 ${card ?? '无'} 并交给 ${target.generalName}`);
      } else {
        host.log(`${source.generalName} 发动【${skill.name}】，亮出 ${revealed.join('、') || '无'}`);
      }
      source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
      host.setPrompt(null);
      return { ok: true };
    }

    if (firstEffect?.action === 'chooseOption') {
      const drawEffect = skill.effects?.find((effect) => effect.action === 'draw');
      const recoverEffect = skill.effects?.find((effect) => effect.action === 'recover');
      if (firstParams.pinDian) {
        const target = firstOtherAliveTarget(state, source.id);
        if (!target) return { ok: false, error: '没有合法的目标角色' };
        host.log(`${source.generalName} 发动【${skill.name}】，与 ${target.generalName} 拼点并按默认结果结算`);
      } else if (firstParams.onHp1) {
        if (source.hp !== 1) return { ok: false, error: '当前不满足发动条件' };
        const redIndex = source.handCards.findIndex(isRedCard);
        if (redIndex >= 0) deck.discardCard(source.handCards.splice(redIndex, 1)[0]!);
        const drawn = deck.drawMany(2);
        source.handCards.push(...drawn);
        host.log(`${source.generalName} 发动【${skill.name}】，摸 ${drawn.length} 张牌`);
      } else if (drawEffect) {
        const drawn = deck.drawMany(Number(effectParams(drawEffect).count ?? 1));
        source.handCards.push(...drawn);
        host.log(`${source.generalName} 发动【${skill.name}】，摸 ${drawn.length} 张牌`);
      } else if (recoverEffect) {
        source.hp = Math.min(source.maxHp, source.hp + Number(effectParams(recoverEffect).amount ?? 1));
        host.log(`${source.generalName} 发动【${skill.name}】，回复体力至 ${source.hp}/${source.maxHp}`);
      } else {
        host.log(`${source.generalName} 发动【${skill.name}】，按默认选项结算`);
      }
      source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
      host.setPrompt(null);
      return { ok: true };
    }

    if (firstEffect?.action === 'discard') {
      const zone = String(firstParams.zone ?? 'hand');
      const target = zone === 'equipment' ? firstOtherAliveTarget(state, source.id) : source;
      if (!target) return { ok: false, error: '没有合法的目标角色' };
      const card = zone === 'equipment' ? target.equipment.pop() : target.handCards.pop();
      if (card) deck.discardCard(card);
      host.log(`${source.generalName} 发动【${skill.name}】${card ? `，弃置 ${target.generalName} 的 ${card}` : '，但没有可弃置的牌'}`);
      source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
      host.setPrompt(null);
      return { ok: true };
    }

    if (firstEffect?.action === 'draw') {
      const count = Number(firstParams.count ?? 1);
      const drawn = deck.drawMany(count);
      source.handCards.push(...drawn);
      source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
      host.log(`${source.generalName} 发动【${skill.name}】，摸 ${drawn.length} 张牌`);
      host.setPrompt(null);
      return { ok: true };
    }

    source.skillUseCount[skill.id] = (source.skillUseCount[skill.id] ?? 0) + 1;
    host.log(`${source.generalName} 发动【${skill.name}】，按技能描述结算`);
    host.setPrompt(null);
    return { ok: true };
  }

  discardRecover(
    host: SkillPlayHost,
    sourceId: string,
    targetId: string,
    handIndices: number | number[],
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (
      !prompt ||
      prompt.type !== 'use_skill' ||
      (prompt.skillId !== 'qingnang' && prompt.skillId !== 'jieyin') ||
      prompt.skillAction !== 'discard_recover'
    ) {
      return { ok: false, error: '当前未在弃牌回复流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }

    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (!prompt.validTargetIds?.includes(targetId)) {
      return { ok: false, error: '目标不合法' };
    }
    if (target.hp >= target.maxHp) {
      return { ok: false, error: '目标未受伤，不能回复' };
    }
    const requiredCount = prompt.discardCount ?? 1;
    const indices = Array.isArray(handIndices) ? handIndices : [handIndices];
    if (indices.length !== requiredCount || new Set(indices).size !== indices.length) {
      return { ok: false, error: `请选择 ${requiredCount} 张手牌` };
    }
    if (indices.some((handIndex) => handIndex < 0 || handIndex >= source.handCards.length)) {
      return { ok: false, error: '所选手牌无效' };
    }
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };

    const discarded = [...indices]
      .sort((a, b) => b - a)
      .map((handIndex) => source.handCards.splice(handIndex, 1)[0]!)
      .reverse();
    for (const card of discarded) {
      host.getDeck().discardCard(card);
    }
    target.hp = Math.min(target.maxHp, target.hp + 1);
    const skillId = prompt.skillId;
    const skillName = prompt.skillName ?? skillId;
    source.skillUseCount[skillId] = (source.skillUseCount[skillId] ?? 0) + 1;
    source.skillTargetUseCount[skillId] = [
      ...(source.skillTargetUseCount[skillId] ?? []),
      targetId,
    ];
    host.log(
      `${source.generalName} 发动【${skillName}】，弃置 ${discarded.join('、')}，令 ${target.generalName} 回复 1 点体力（${target.hp}/${target.maxHp}）`,
    );

    const canContinue =
      skillId === 'qingnang' &&
      discarded.some(isRedCard) &&
      source.handCards.length > 0 &&
      state.players.some(
        (player) =>
          player.hp > 0 &&
          player.hp < player.maxHp &&
          !(source.skillTargetUseCount.qingnang ?? []).includes(player.id),
      );

    if (!canContinue) {
      host.setPrompt(null);
      host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
      return { ok: true };
    }

    const nextTargets = filterAvailableTargetsForSkill(
      source,
      skillId,
      state.players
        .filter((player) => player.hp > 0 && player.hp < player.maxHp)
        .map((player) => player.id),
    );
    host.setPrompt({
      ...prompt,
      id: nextPromptId(),
      validTargetIds: nextTargets,
      discardHandIndices: source.handCards.map((_, index) => index),
      message: `【青囊】弃置红色牌后可再次发动，请选择未选择过的目标。`,
    });
    return { ok: true };
  }

  giveCards(
    host: SkillPlayHost,
    sourceId: string,
    targetId: string,
    cardEntries: string[],
    handIndices?: number[],
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || !prompt.skillId) {
      return { ok: false, error: '当前未在给出手牌流程中' };
    }
    const isYiji = prompt.skillId === 'yiji';
    const isQingjian = prompt.skillId === 'qingjian';
    const yijiPending = state.resolution.context.yijiPending as
      | { playerId: string; givenCards: number; targetIds: string[] }
      | undefined;
    const qingjianPending = state.resolution.context.qingjianPending as
      | { playerId: string; remainingCards: string[]; used: boolean }
      | undefined;
    if (isYiji && (!yijiPending || yijiPending.playerId !== sourceId)) {
      return { ok: false, error: '当前未在遗计分配流程中' };
    }
    if (isQingjian && (!qingjianPending || qingjianPending.playerId !== sourceId)) {
      return { ok: false, error: '当前未在清俭分配流程中' };
    }

    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (targetId === sourceId) {
      return { ok: false, error: '目标必须为其他角色' };
    }
    if (!prompt.validTargetIds?.includes(targetId)) {
      return { ok: false, error: '目标不合法' };
    }
    if (isYiji && yijiPending?.targetIds.includes(targetId)) {
      return { ok: false, error: '本次【遗计】不能再次分配给该角色' };
    }
    if (!isYiji && !isQingjian && (source.skillTargetUseCount[prompt.skillId] ?? []).includes(targetId)) {
      return { ok: false, error: '本回合不能再次对该角色发动此技能' };
    }
    if (!cardEntries.length) return { ok: false, error: '请至少选择一张手牌' };
    if (isYiji && yijiPending && yijiPending.givenCards + cardEntries.length > 2) {
      return { ok: false, error: '【遗计】至多分配两张手牌' };
    }
    if (isQingjian) {
      const allowed = new Set(prompt.discardHandIndices ?? []);
      const indices = handIndices ?? [];
      if (indices.length !== cardEntries.length || indices.some((index) => !allowed.has(index))) {
        return { ok: false, error: '【清俭】只能交给这次获得的牌' };
      }
    }

    const skill = this.findSkill(source, prompt.skillId);
    const skillLabel = skill?.name ?? prompt.skillId;
    const selectedCards: Array<{ index: number; card: string }> = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < cardEntries.length; i += 1) {
      const entry = cardEntries[i]!;
      let index =
        handIndices?.[i] != null && handIndices[i]! >= 0
          ? handIndices[i]!
          : source.handCards.findIndex((card) => handEntriesMatch(card, entry));

      if (
        usedIndices.has(index) ||
        !source.handCards[index] ||
        !handEntriesMatch(source.handCards[index]!, entry)
      ) {
        index = source.handCards.findIndex(
          (card, handIndex) => handEntriesMatch(card, entry) && !usedIndices.has(handIndex),
        );
      }

      if (index < 0 || !source.handCards[index]) {
        return { ok: false, error: `手牌中没有${entry}` };
      }

      usedIndices.add(index);
      selectedCards.push({ index, card: source.handCards[index]! });
    }

    const given = selectedCards.map(({ card }) => card);
    [...selectedCards]
      .sort((left, right) => right.index - left.index)
      .forEach(({ index }) => source.handCards.splice(index, 1));
    target.handCards.push(...given);

    host.log(
      `${source.generalName} 发动【${skillLabel}】，将 ${given.length} 张手牌交给 ${target.generalName}`,
    );
    if (isYiji && yijiPending) {
      yijiPending.givenCards += given.length;
      yijiPending.targetIds.push(targetId);
    } else if (isQingjian && qingjianPending) {
      qingjianPending.used = true;
      for (const card of given) {
        const index = qingjianPending.remainingCards.findIndex((entry) => handEntriesMatch(entry, card));
        if (index >= 0) qingjianPending.remainingCards.splice(index, 1);
      }
      source.skillUseCount.qingjian = Math.max(1, source.skillUseCount.qingjian ?? 0);
    } else {
      source.skillUseCount[prompt.skillId] = (source.skillUseCount[prompt.skillId] ?? 0) + 1;
      source.skillTargetUseCount[prompt.skillId] = [
        ...(source.skillTargetUseCount[prompt.skillId] ?? []),
        targetId,
      ];
    }

    if (prompt.skillId === 'rende' && source.skillUseCount.rende === 2) {
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId: 'rende',
        skillName: skillLabel,
        skillAction: 'virtual_basic',
        characterSkills: characterSkillsForPrompt(source),
        message: '【仁德】第二次给牌后，可以视为使用一张基本牌。',
        options: [
          { id: 'rende:basic:杀', label: '视为使用【杀】' },
          { id: 'rende:basic:桃', label: '视为使用【桃】' },
          { id: 'rende:basic:酒', label: '视为使用【酒】' },
          { id: 'cancel', label: '不使用' },
        ],
      });
      return { ok: true };
    }

    if (prompt.autoCloseAfterSubmit) {
      host.setPrompt(null);
      if (state.turn.phase === 'play') {
        host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
      }
      return { ok: true };
    }

    const yijiRemaining = isYiji && yijiPending ? Math.max(0, 2 - yijiPending.givenCards) : 0;
    const qingjianRemainingCards = isQingjian && qingjianPending ? qingjianPending.remainingCards : [];
    if (isQingjian && qingjianPending && qingjianRemainingCards.length === 0) {
      delete state.resolution.context.qingjianPending;
      host.setPrompt(null);
      host.log(`${source.generalName} 结束【清俭】分配`);
      return { ok: true };
    }
    const yijiTargets = isYiji && yijiPending
      ? state.players
          .filter(
            (player) =>
              player.id !== sourceId &&
              player.hp > 0 &&
              !player.dead &&
              !yijiPending.targetIds.includes(player.id),
          )
          .map((player) => player.id)
      : prompt.validTargetIds;
    const usedQingjianIndices = new Set<number>();
    const qingjianAllowedIndices = qingjianRemainingCards
      .map((card) => {
        const index = source.handCards.findIndex(
          (entry, handIndex) =>
            handEntriesMatch(entry, card) && !usedQingjianIndices.has(handIndex),
        );
        if (index >= 0) usedQingjianIndices.add(index);
        return index;
      })
      .filter((index) => index >= 0);

    host.setPrompt({
      ...prompt,
      id: nextPromptId(),
      validTargetIds: yijiTargets,
      discardCount: isYiji ? yijiRemaining : isQingjian ? qingjianRemainingCards.length : prompt.discardCount,
      discardHandIndices: isQingjian
        ? qingjianAllowedIndices
        : source.handCards.map((_, index) => index),
      message: isYiji
        ? `【遗计】已分配 ${yijiPending?.givenCards ?? 0} 张牌，可继续分配或完成。`
        : isQingjian
          ? `【清俭】已交给 ${target.generalName} ${given.length} 张牌，可继续分配剩余获得牌或完成。`
          : `【${skillLabel}】已给出 ${given.length} 张牌给 ${target.generalName}，可继续选择或点击“完成”。`,
    });
    return { ok: true };
  }

  executeJianyan(
    host: SkillPlayHost,
    sourceId: string,
    choiceId: string,
    targetId: string,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'jianyan') {
      return { ok: false, error: '当前未在荐言流程中' };
    }

    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (!prompt.validTargetIds?.includes(targetId)) {
      return { ok: false, error: '目标不合法' };
    }
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };

    const drawn = host.getDeck().drawOne();
    if (!drawn) return { ok: false, error: '牌堆为空' };

    const cardDef = CardRegistry.getByName(drawn);
    const isRed = drawn.includes('♥') || drawn.includes('♦');
    const isBlack = drawn.includes('♠') || drawn.includes('♣');

    let matched = false;
    switch (choiceId) {
      case 'jianyan:red':
        matched = isRed;
        break;
      case 'jianyan:black':
        matched = isBlack;
        break;
      case 'jianyan:basic':
        matched = cardDef?.type === 'basic';
        break;
      case 'jianyan:trick':
        matched = cardDef?.type === 'trick';
        break;
      case 'jianyan:equipment':
        matched = cardDef?.type === 'equipment';
        break;
      default:
        return { ok: false, error: '荐言声明无效' };
    }

    source.skillUseCount.jianyan = (source.skillUseCount.jianyan ?? 0) + 1;
    if (matched) {
      target.handCards.push(drawn);
      host.log(`${source.generalName} 发动【荐言】，亮出 ${drawn} 并交给 ${target.generalName}`);
    } else {
      host.log(`${source.generalName} 发动【荐言】，亮出 ${drawn}，但不符合声明`);
    }
    host.setPrompt(null);
    return { ok: true };
  }

  executeFanjianGive(
    host: SkillPlayHost,
    sourceId: string,
    targetId: string,
    handIndex: number,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'fanjian') {
      return { ok: false, error: '当前未在反间流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }
    if (!prompt.validTargetIds?.includes(targetId)) {
      return { ok: false, error: '目标不合法' };
    }
    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (handIndex < 0 || handIndex >= source.handCards.length) {
      return { ok: false, error: '所选手牌无效' };
    }

    const card = source.handCards.splice(handIndex, 1)[0]!;
    target.handCards.push(card);
    source.skillUseCount.fanjian = (source.skillUseCount.fanjian ?? 0) + 1;
    host.log(`${source.generalName} 发动【反间】，交给 ${target.generalName} 一张手牌`);
    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: targetId,
      sourcePlayerId: sourceId,
      targetPlayerIds: [targetId],
      skillId: 'fanjian',
      skillName: prompt.skillName ?? '反间',
      skillAction: 'target_choice',
      cardName: card,
      message: `${target.generalName} 选择展示并弃置与 ${card} 花色相同的所有手牌，或失去 1 点体力。`,
      options: [
        { id: 'fanjian:discard_same_suit', label: '弃同花色手牌' },
        { id: 'fanjian:lose_hp', label: '失去 1 点体力' },
      ],
    });
    return { ok: true };
  }

  executeFanjianResolve(
    host: SkillPlayHost,
    targetId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'fanjian') {
      return { ok: false, error: '当前未在反间流程中' };
    }
    if (prompt.playerId !== targetId) {
      return { ok: false, error: '不是你响应的技能' };
    }
    const target = state.players.find((player) => player.id === targetId);
    const source = state.players.find((player) => player.id === prompt.sourcePlayerId);
    if (!target || !source) return { ok: false, error: '角色不存在' };
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };

    if (choiceId === 'fanjian:lose_hp') {
      target.hp = Math.max(0, target.hp - 1);
      host.log(`${target.generalName} 受到【反间】影响，失去 1 点体力（${target.hp}/${target.maxHp}）`);
    } else if (choiceId === 'fanjian:discard_same_suit') {
      const suit = suitOf(prompt.cardName ?? '');
      if (!suit) return { ok: false, error: '反间牌花色无效' };
      const discarded: string[] = [];
      for (let index = target.handCards.length - 1; index >= 0; index -= 1) {
        const card = target.handCards[index]!;
        if (suitOf(card) !== suit) continue;
        discarded.push(target.handCards.splice(index, 1)[0]!);
      }
      discarded.reverse().forEach((card) => host.getDeck?.().discardCard(card));
      host.log(
        `${target.generalName} 受到【反间】影响，展示手牌并弃置 ${discarded.length} 张${suit}花色手牌`,
      );
    } else {
      return { ok: false, error: '反间选择无效' };
    }

    host.setPrompt(null);
    host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    return { ok: true };
  }

  executeLijian(
    host: SkillPlayHost,
    sourceId: string,
    duelSourceId: string,
    duelTargetId: string,
    zoneCardId: string,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'lijian') {
      return { ok: false, error: '当前未在离间流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }
    if (duelSourceId === duelTargetId) {
      return { ok: false, error: '两名目标不能相同' };
    }
    if (!prompt.validTargetIds?.includes(duelSourceId) || !prompt.validTargetIds.includes(duelTargetId)) {
      return { ok: false, error: '目标不合法' };
    }
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };

    const source = state.players.find((player) => player.id === sourceId);
    const duelSource = state.players.find((player) => player.id === duelSourceId);
    const duelTarget = state.players.find((player) => player.id === duelTargetId);
    if (!source || !duelSource || !duelTarget) return { ok: false, error: '角色不存在' };
    if (!isMaleCharacter(duelSource) || !isMaleCharacter(duelTarget)) {
      return { ok: false, error: '目标必须为男性角色' };
    }

    const parsed = parseZoneCardId(zoneCardId);
    if (!parsed || parsed.zone === 'judge') return { ok: false, error: '请选择一张手牌或装备弃置' };
    const handCountBefore = source.handCards.length;
    const equipmentCountBefore = source.equipment.length;
    const discarded = discardZoneCard(source, parsed.zone, parsed.index, host.getDeck(), (message) =>
      host.log(message),
    );
    if (!discarded) return { ok: false, error: '所选牌无效' };
    host.afterPlayerLostHandCards?.(source, handCountBefore - source.handCards.length);
    host.afterPlayerLostEquipmentCards?.(
      source,
      equipmentCountBefore - source.equipment.length,
    );

    const duelCard = CardRegistry.getByName('决斗');
    if (!duelCard) return { ok: false, error: '缺少【决斗】卡牌配置' };
    const timingContext = { source: duelSource, card: duelCard, responsesRequired: 1 };
    applyLockedModifiers(timingContext);
    setCardPlayContext(state.resolution.context, {
      cardId: duelCard.id,
      sourcePlayerId: duelSource.id,
      targetPlayerIds: [duelTarget.id],
      isAoe: false,
      responseType: 'sha',
      responsesRequired: timingContext.responsesRequired ?? 1,
      responseCount: 0,
      awaitingResponseFrom: duelTarget.id,
      virtualFromSkill: 'lijian',
      committedCardEntry: duelCard.name,
      cardCommitted: true,
      duelActive: true,
      duelInitiator: duelSource.id,
      duelTarget: duelTarget.id,
    });
    source.skillUseCount.lijian = (source.skillUseCount.lijian ?? 0) + 1;
    host.log(
      `${source.generalName} 发动【离间】，令 ${duelSource.generalName} 视为对 ${duelTarget.generalName} 使用【决斗】`,
    );
    host.setPrompt({
      id: nextPromptId(),
      type: 'response',
      playerId: duelTarget.id,
      cardId: duelCard.id,
      cardName: duelCard.name,
      sourcePlayerId: duelSource.id,
      targetPlayerIds: [duelTarget.id],
      validResponseCards: validResponseCardsForPlayer(duelTarget, 'sha', duelTarget.handCards),
      message: `${duelTarget.generalName}：请打出【杀】继续决斗（不出则受到 1 点伤害）`,
      options: [{ id: 'pass', label: '不出（承受伤害）' }],
    });
    return { ok: true };
  }

  executeLiyu(
    host: SkillPlayHost,
    victimId: string,
    duelTargetId: string,
    zoneCardId: string,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'liyu') {
      return { ok: false, error: '当前未在利驭流程中' };
    }
    if (prompt.playerId !== victimId) {
      return { ok: false, error: '不是你响应的技能' };
    }
    if (!prompt.validTargetIds?.includes(duelTargetId)) {
      return { ok: false, error: '目标不合法' };
    }

    const victim = state.players.find((player) => player.id === victimId);
    const source = state.players.find((player) => player.id === prompt.sourcePlayerId);
    const duelTarget = state.players.find((player) => player.id === duelTargetId);
    if (!victim || !source || !duelTarget) return { ok: false, error: '角色不存在' };

    const parsed = parseZoneCardId(zoneCardId);
    if (!parsed) return { ok: false, error: '请选择一张牌交给吕布' };
    const handCountBefore = victim.handCards.length;
    const equipmentCountBefore = victim.equipment.length;
    const ok = takeZoneCard(victim, source, parsed.zone, parsed.index, (message) => host.log(message));
    if (!ok) return { ok: false, error: '所选牌无效' };
    host.afterPlayerLostHandCards?.(victim, handCountBefore - victim.handCards.length);
    host.afterPlayerLostEquipmentCards?.(
      victim,
      equipmentCountBefore - victim.equipment.length,
    );

    const duelCard = CardRegistry.getByName('决斗');
    if (!duelCard) return { ok: false, error: '缺少【决斗】卡牌配置' };
    const timingContext = { source, card: duelCard, responsesRequired: 1 };
    applyLockedModifiers(timingContext);
    setCardPlayContext(state.resolution.context, {
      cardId: duelCard.id,
      sourcePlayerId: source.id,
      targetPlayerIds: [duelTarget.id],
      isAoe: false,
      responseType: 'sha',
      responsesRequired: timingContext.responsesRequired ?? 1,
      responseCount: 0,
      awaitingResponseFrom: duelTarget.id,
      virtualFromSkill: 'liyu',
      committedCardEntry: duelCard.name,
      cardCommitted: true,
      duelActive: true,
      duelInitiator: source.id,
      duelTarget: duelTarget.id,
    });
    delete state.resolution.context.pendingReactive;
    source.skillUseCount.liyu = (source.skillUseCount.liyu ?? 0) + 1;
    host.log(
      `${victim.generalName} 发动 ${source.generalName} 的【利驭】，令其获得一张牌并视为对 ${duelTarget.generalName} 使用【决斗】`,
    );
    host.setPrompt({
      id: nextPromptId(),
      type: 'response',
      playerId: duelTarget.id,
      cardId: duelCard.id,
      cardName: duelCard.name,
      sourcePlayerId: source.id,
      targetPlayerIds: [duelTarget.id],
      validResponseCards: validResponseCardsForPlayer(duelTarget, 'sha', duelTarget.handCards),
      message: `${duelTarget.generalName}：请打出【杀】继续决斗（不出则受到 1 点伤害）`,
      options: [{ id: 'pass', label: '不出（承受伤害）' }],
    });
    return { ok: true };
  }

  executeZhaxiang(
    host: SkillPlayHost,
    sourceId: string,
    choiceId: string,
    handIndex?: number,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'zhaxiang') {
      return { ok: false, error: '当前未在诈降流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }

    const source = state.players.find((player) => player.id === sourceId);
    if (!source) return { ok: false, error: '角色不存在' };

    if (choiceId === 'skip') {
      host.setPrompt(null);
      if (state.turn.phase === 'play') {
        host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
      }
      return { ok: true };
    }

    if (choiceId !== 'zhaxiang:recover' && choiceId !== 'zhaxiang:draw') {
      return { ok: false, error: '诈降选择无效' };
    }
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };
    if (source.hp !== 1) return { ok: false, error: '当前不满足【诈降】发动条件' };

    const candidateIndices = prompt.discardHandIndices ?? [];
    const selectedIndex = handIndex ?? candidateIndices[0];
    if (selectedIndex == null || !candidateIndices.includes(selectedIndex)) {
      return { ok: false, error: '请选择一张红色手牌' };
    }
    const selectedCard = source.handCards[selectedIndex];
    if (!selectedCard || !isRedCard(selectedCard)) {
      return { ok: false, error: '请选择一张红色手牌' };
    }

    source.handCards.splice(selectedIndex, 1);
    host.getDeck().discardCard(selectedCard);
    source.skillUseCount.zhaxiang = (source.skillUseCount.zhaxiang ?? 0) + 1;

    if (choiceId === 'zhaxiang:recover') {
      source.hp = Math.min(source.maxHp, source.hp + 1);
      host.log(
        `${source.generalName} 发动【诈降】，弃置 ${selectedCard} 并回复 1 点体力（${source.hp}/${source.maxHp}）`,
      );
    } else {
      const drawn = host.getDeck().drawMany(2);
      source.handCards.push(...drawn);
      host.log(
        `${source.generalName} 发动【诈降】，弃置 ${selectedCard} 并摸 ${drawn.length} 张牌`,
      );
    }

    host.setPrompt(null);
    if (state.turn.phase === 'play') {
      host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    }
    return { ok: true };
  }

  executeYijuePindian(
    host: SkillPlayHost,
    sourceId: string,
    targetId: string,
    sourceHandIndex: number,
    targetHandIndex: number,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'yijue') {
      return { ok: false, error: '当前未在义绝流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }
    if (!prompt.validTargetIds?.includes(targetId)) {
      return { ok: false, error: '目标不合法' };
    }
    if (!host.getDeck) return { ok: false, error: '牌堆能力不可用' };

    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (sourceHandIndex < 0 || sourceHandIndex >= source.handCards.length) {
      return { ok: false, error: '所选手牌无效' };
    }
    if (targetHandIndex < 0 || targetHandIndex >= target.handCards.length) {
      return { ok: false, error: '目标拼点手牌无效' };
    }

    const sourceCard = source.handCards.splice(sourceHandIndex, 1)[0]!;
    const targetCard = target.handCards.splice(targetHandIndex, 1)[0]!;
    host.getDeck().discardCard(sourceCard);
    host.getDeck().discardCard(targetCard);

    const sourcePoint = pointOf(sourceCard);
    const targetPoint = pointOf(targetCard);
    source.skillUseCount.yijue = (source.skillUseCount.yijue ?? 0) + 1;

    if (sourcePoint > targetPoint) {
      target.skillUseCount._yijue_hand_blocked = 1;
      target.skillUseCount._yijue_non_locked_disabled = 1;
      host.log(
        `${source.generalName} 发动【义绝】，以 ${sourceCard} 拼点胜过 ${target.generalName} 的 ${targetCard}，${target.generalName} 本回合不能使用或打出手牌且非锁定技失效`,
      );
      host.setPrompt(null);
      if (state.turn.phase === 'play') {
        host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
      }
      return { ok: true };
    }

    state.resolution.context.yijueRecover = { sourceId, targetId };
    host.log(
      `${source.generalName} 发动【义绝】，以 ${sourceCard} 拼点未胜过 ${target.generalName} 的 ${targetCard}`,
    );
    host.setPrompt({
      id: nextPromptId(),
      type: 'use_skill',
      playerId: sourceId,
      skillId: 'yijue',
      skillName: prompt.skillName ?? '义绝',
      skillAction: 'recover_choice',
      targetPlayerIds: [targetId],
      characterSkills: characterSkillsForPrompt(source),
      message: `【义绝】：拼点未赢，可以令 ${target.generalName} 回复 1 点体力。`,
      options: [
        { id: 'yijue:recover', label: '令其回复' },
        { id: 'skip', label: '不回复' },
      ],
    });
    return { ok: true };
  }

  executeYijueRecover(
    host: SkillPlayHost,
    sourceId: string,
    choiceId: string,
  ): { ok: boolean; error?: string } {
    const state = host.getState();
    const prompt = state.prompt;
    if (!prompt || prompt.type !== 'use_skill' || prompt.skillId !== 'yijue') {
      return { ok: false, error: '当前未在义绝回复流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }
    const context = state.resolution.context.yijueRecover as
      | { sourceId: string; targetId: string }
      | undefined;
    if (!context || context.sourceId !== sourceId) {
      return { ok: false, error: '义绝回复上下文不存在' };
    }
    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === context.targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };

    if (choiceId === 'yijue:recover') {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + 1);
      host.log(
        `${source.generalName} 令 ${target.generalName} 因【义绝】回复 ${target.hp - before} 点体力（${target.hp}/${target.maxHp}）`,
      );
    } else if (choiceId === 'skip') {
      host.log(`${source.generalName} 不令 ${target.generalName} 因【义绝】回复体力`);
    } else {
      return { ok: false, error: '义绝选择无效' };
    }

    delete state.resolution.context.yijueRecover;
    host.setPrompt(null);
    if (state.turn.phase === 'play') {
      host.log(`-- ${source.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    }
    return { ok: true };
  }

  finish(host: SkillPlayHost, sourceId: string): { ok: boolean; error?: string } {
    const prompt = host.getState().prompt;
    if (!prompt || prompt.type !== 'use_skill' || !prompt.skillId) {
      return { ok: false, error: '当前未在技能流程中' };
    }
    if (prompt.playerId !== sourceId) {
      return { ok: false, error: '不是你发动的技能' };
    }

    const currentPlayer = host.getState().players.find((player) => player.id === sourceId);
    if (!currentPlayer) return { ok: false, error: '玩家不存在' };

    if (prompt.skillId === 'yiji') {
      delete host.getState().resolution.context.yijiPending;
    } else if (prompt.skillId === 'qingjian') {
      delete host.getState().resolution.context.qingjianPending;
    } else {
      currentPlayer.skillUseCount[prompt.skillId] =
        (currentPlayer.skillUseCount[prompt.skillId] ?? 0) + 1;
    }
    host.log(`${currentPlayer.generalName} 结束【${prompt.skillName ?? prompt.skillId}】`);
    host.setPrompt(null);
    if (host.getState().turn.phase === 'play') {
      host.log(`-- ${currentPlayer.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    }
    return { ok: true };
  }
}
