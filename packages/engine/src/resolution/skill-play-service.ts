import { CardRegistry } from '../registry/card-registry';
import { CharacterRegistry } from '../registry/character-registry';
import type { GameState } from '../state/game-state';
import { characterSkillsForPrompt } from '../engine/timing-runner';
import { handEntriesMatch } from '../engine/card-label';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { SkillDefinition } from '../types/skill';
import { GameTiming } from '../types/timing';
import { nextPromptId } from '../utils/prompt-id';

export interface SkillPlayHost {
  getState(): GameState;
  log(message: string): void;
  setPrompt(prompt: GamePrompt | null): void;
  getDeck?: () => { drawOne(): string | undefined };
}

export class SkillPlayService {
  private findSkill(player: EnginePlayerState, skillId: string): SkillDefinition | undefined {
    const character = CharacterRegistry.resolve(player.generalName);
    return character?.skills.find((skill) => skill.id === skillId);
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
      const others = host
        .getState()
        .players.filter((player) => player.id !== sourceId && player.hp > 0)
        .map((player) => player.id);
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
        message: `【${skill.name}】：选择一名其他角色并给出手牌，可多次给出直到点击“完成”。`,
        validTargetIds: others,
        options: [
          { id: `${skillId}:finish`, label: `完成${skill.name}` },
          { id: 'cancel', label: '取消' },
        ],
      });
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

    return { ok: false, error: '该技能效果尚未接入通用流程' };
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

    const source = state.players.find((player) => player.id === sourceId);
    const target = state.players.find((player) => player.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (targetId === sourceId) {
      return { ok: false, error: '目标必须为其他角色' };
    }
    if (!cardEntries.length) return { ok: false, error: '请至少选择一张手牌' };

    const skill = this.findSkill(source, prompt.skillId);
    const skillLabel = skill?.name ?? prompt.skillId;
    const given: string[] = [];
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
      const card = source.handCards.splice(index, 1)[0]!;
      target.handCards.push(card);
      given.push(card);
    }

    host.log(`${source.generalName} 发动【${skillLabel}】，将 ${given.join('、')} 交给 ${target.generalName}`);
    host.setPrompt({
      ...prompt,
      id: nextPromptId(),
      message: `【${skillLabel}】已给出 ${given.length} 张牌给 ${target.generalName}，可继续选择或点击“完成”。`,
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

    currentPlayer.skillUseCount[prompt.skillId] =
      (currentPlayer.skillUseCount[prompt.skillId] ?? 0) + 1;
    host.log(`${currentPlayer.generalName} 结束【${prompt.skillName ?? prompt.skillId}】`);
    host.setPrompt(null);
    host.log(`-- ${currentPlayer.generalName} 出牌阶段：可继续出牌、发动技能或结束回合`);
    return { ok: true };
  }
}
