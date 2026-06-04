import { CharacterRegistry } from '../registry/character-registry';
import type { SkillDefinition } from '../types/skill';
import type { EnginePlayerState, GamePrompt } from '../types/game';
import type { GameState } from '../state/game-state';
import { GameTiming } from '../types/timing';
import { nextPromptId } from '../utils/prompt-id';
import { characterSkillsForPrompt } from '../engine/timing-runner';
import { cardNameFromHandEntry, handEntriesMatch } from '../engine/card-label';

export interface SkillPlayHost {
  getState(): GameState;
  log(message: string): void;
  setPrompt(prompt: GamePrompt | null): void;
}

/**
 * 主动技：按技能配置 effects 驱动，不按 skillId 硬编码。
 */
export class SkillPlayService {
  private findSkill(player: EnginePlayerState, skillId: string): SkillDefinition | undefined {
    const ch = CharacterRegistry.resolve(player.generalName);
    return ch?.skills.find((s) => s.id === skillId);
  }

  initiate(
    host: SkillPlayHost,
    sourceId: string,
    skillId: string,
  ): { ok: boolean; error?: string } {
    if (host.getState().prompt) {
      return { ok: false, error: '请先处理当前提示' };
    }
    const source = host.getState().players.find((p) => p.id === sourceId);
    if (!source) return { ok: false, error: '玩家不存在' };
    if (host.getState().turn.phase !== 'play') {
      return { ok: false, error: '当前不是出牌阶段' };
    }
    const cur = host.getState().players[host.getState().turn.index];
    if (!cur || cur.id !== sourceId) {
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

    const giveEffect = skill.effects?.find((e) => e.action === 'giveCards');
    if (giveEffect) {
      const others = host
        .getState()
        .players.filter((p) => p.id !== sourceId && p.hp > 0)
        .map((p) => p.id);
      if (others.length === 0) {
        return { ok: false, error: '没有可给予牌的角色' };
      }
      host.setPrompt({
        id: nextPromptId(),
        type: 'use_skill',
        playerId: sourceId,
        skillId,
        skillName: skill.name,
        characterSkills: characterSkillsForPrompt(source),
        message: `【${skill.name}】：选择一名其他角色并给予手牌，可多次给予直至点击「完成」`,
        validTargetIds: others,
        options: [
          { id: `${skillId}:finish`, label: `完成【${skill.name}】` },
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
      return { ok: false, error: '当前未在给予手牌流程中' };
    }
    const skillId = prompt.skillId;
    const source = state.players.find((p) => p.id === sourceId);
    const target = state.players.find((p) => p.id === targetId);
    if (!source || !target) return { ok: false, error: '角色不存在' };
    if (targetId === sourceId) {
      return { ok: false, error: '目标须为其他角色' };
    }
    if (!cardEntries.length) return { ok: false, error: '请选择至少一张手牌' };

    const skill = this.findSkill(source, skillId);
    const skillLabel = skill?.name ?? skillId;

    const given: string[] = [];
    const usedIndices = new Set<number>();
    for (let i = 0; i < cardEntries.length; i++) {
      const entry = cardEntries[i]!;
      let idx =
        handIndices?.[i] != null && handIndices[i]! >= 0
          ? handIndices[i]!
          : source.handCards.findIndex((c) => handEntriesMatch(c, entry));
      if (usedIndices.has(idx) || !source.handCards[idx] || !handEntriesMatch(source.handCards[idx]!, entry)) {
        idx = source.handCards.findIndex(
          (c, j) => handEntriesMatch(c, entry) && !usedIndices.has(j),
        );
      }
      if (idx < 0 || !source.handCards[idx]) {
        return { ok: false, error: `手牌中没有 ${entry}` };
      }
      usedIndices.add(idx);
      const card = source.handCards.splice(idx, 1)[0]!;
      target.handCards.push(card);
      given.push(card);
    }

    host.log(
      `${source.generalName} 发动【${skillLabel}】，将 ${given.join('、')} 交给 ${target.generalName}`,
    );

    host.setPrompt({
      ...prompt,
      id: nextPromptId(),
      message: `【${skillLabel}】已给予 ${target.generalName} ${given.length} 张，可继续选牌或点击「完成」`,
    });
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
    const cur = host.getState().players.find((p) => p.id === sourceId);
    if (!cur) return { ok: false, error: '玩家不存在' };

    const skillId = prompt.skillId;
    const skill = this.findSkill(cur, skillId);
    cur.skillUseCount[skillId] = (cur.skillUseCount[skillId] ?? 0) + 1;
    host.log(`${cur.generalName} 结束【${skill?.name ?? skillId}】`);
    host.setPrompt(null);
    host.log(
      `—— ${cur.generalName} 出牌阶段：可选择出牌、发动技能或结束回合`,
    );
    return { ok: true };
  }
}
