import { CharacterRegistry } from '../registry/character-registry';
import type { GameState } from '../state/game-state';
import type { RuleDefinition } from '../types/rule';
import type { GameEvent } from '../types/event';
import type { EventPhase } from '../types/event';
import { GameTiming } from '../types/timing';
import type { GamePrompt } from '../types/game';
import { ConditionRegistry, type ConditionContext } from './condition-registry';
import { EffectExecutor, type EffectExecutionContext } from './effect-executor';
import { InteractionRegistry } from './interaction-registry';
import { resolveEventTiming } from './event-timing-map';
import type { DeckPile } from '../engine/deck-pile';
import { nextPromptId } from '../utils/prompt-id';
import { characterSkillsForPrompt } from '../engine/timing-runner';

export interface RuleEmitContext {
  state: GameState;
  event: GameEvent;
  phase: EventPhase;
  ownerPlayerId?: string;
  log: (message: string) => void;
  deck?: DeckPile;
  setPrompt?: (prompt: GamePrompt | null) => void;
}

export interface RuleEmitResult {
  paused: boolean;
}

/**
 * 规则层：监听 timing × phase，执行 conditions → effects | handler。
 * 技能按「持有者是否拥有该 skillId」匹配，不按武将名分支。
 */
export class RuleManager {
  private readonly rules: RuleDefinition[] = [];
  readonly conditions = new ConditionRegistry();
  readonly effects = new EffectExecutor();
  readonly interactions = new InteractionRegistry();

  constructor() {
    this.conditions.registerDefaults();
    this.interactions.registerStubHandlers();
  }

  register(rule: RuleDefinition): void {
    this.rules.push(rule);
  }

  registerAll(rules: RuleDefinition[]): void {
    for (const r of rules) this.register(r);
  }

  matchRulesForTiming(timing: GameTiming, phase: EventPhase): RuleDefinition[] {
    return this.rules
      .filter((r) => r.timing === timing && r.phase === phase)
      .sort((a, b) => b.priority - a.priority);
  }

  /** 全局规则（装备等，后续扩展 ownerScope） */
  async emit(ctx: RuleEmitContext): Promise<RuleEmitResult> {
    const timing = resolveEventTiming(ctx.event.type, ctx.phase);
    if (!timing) return { paused: false };

    const matched = this.matchRulesForTiming(timing, ctx.phase);
    for (const rule of matched) {
      const paused = await this.executeRule(rule, ctx, ctx.ownerPlayerId);
      if (paused) return { paused: true };
    }
    return { paused: false };
  }

  /**
   * 受伤后等：对每名拥有对应技能的玩家询问/结算。
   * 主动技首次匹配时弹窗暂停；锁定技自动执行。
   */
  async emitForPlayersWithSkills(
    ctx: RuleEmitContext,
    timing: GameTiming,
  ): Promise<RuleEmitResult> {
    // 「受伤后」类技能仅对受伤角色询问（如反馈、奸雄、刚烈）
    const players =
      timing === GameTiming.AFTER_DAMAGE && ctx.ownerPlayerId
        ? ctx.state.players.filter((p) => p.id === ctx.ownerPlayerId)
        : ctx.state.players;

    for (const player of players) {
      if (player.hp <= 0 && timing === GameTiming.AFTER_DAMAGE) continue;

      const ch = CharacterRegistry.resolve(player.generalName);
      if (!ch) continue;

      for (const skill of ch.skills) {
        if (!skill.timings.includes(timing)) continue;
        const phase = skill.triggerPhase ?? inferPhaseFromTiming(timing);
        if (phase !== ctx.phase) continue;

        if (
          skill.limitPerTurn != null &&
          (player.skillUseCount[skill.id] ?? 0) >= skill.limitPerTurn
        ) {
          continue;
        }

        const rule = this.rules.find(
          (r) => r.source.type === 'skill' && r.source.id === skill.id && r.timing === timing,
        );
        if (!rule) continue;

        if (skill.type === 'locked') {
          const paused = await this.executeRule(rule, ctx, player.id);
          if (paused) return { paused: true };
          continue;
        }

        if (skill.type === 'active' || skill.type === 'passive') {
          if (ctx.setPrompt) {
            ctx.setPrompt({
              id: nextPromptId(),
              type: 'use_skill',
              playerId: player.id,
              characterSkills: characterSkillsForPrompt(player),
              message: `${player.generalName}：是否发动【${skill.name}】？`,
              options: [
                { id: `skill:${skill.id}`, label: `发动【${skill.name}】` },
                { id: 'skip', label: '不发动' },
              ],
            });
            ctx.state.resolution.context.pendingReactive = {
              eventId: ctx.event.id,
              playerId: player.id,
              skillId: skill.id,
            };
            return { paused: true };
          }
        }
      }
    }
    return { paused: false };
  }

  /** 玩家确认发动 pendingReactive 技能 */
  async confirmReactiveSkill(
    ctx: RuleEmitContext,
    playerId: string,
    skillId: string,
  ): Promise<void> {
    const pending = ctx.state.resolution.context.pendingReactive as
      | { eventId: string; playerId: string; skillId: string }
      | undefined;
    if (!pending || pending.playerId !== playerId || pending.skillId !== skillId) {
      return;
    }

    const player = ctx.state.players.find((p) => p.id === playerId);
    if (!player) return;

    const rule = this.rules.find(
      (r) => r.source.type === 'skill' && r.source.id === skillId,
    );
    if (rule) {
      player.skillUseCount[skillId] = (player.skillUseCount[skillId] ?? 0) + 1;
      await this.executeRule(rule, ctx, playerId);
    }
    delete ctx.state.resolution.context.pendingReactive;
  }

  skipReactiveSkill(ctx: RuleEmitContext): void {
    delete ctx.state.resolution.context.pendingReactive;
  }

  private async executeRule(
    rule: RuleDefinition,
    ctx: RuleEmitContext,
    ownerPlayerId?: string,
  ): Promise<boolean> {
    const ownerId = ownerPlayerId ?? ctx.ownerPlayerId ?? ctx.event.payload.sourcePlayerId;
    if (!ownerId) return false;

    const owner = ctx.state.players.find((p) => p.id === ownerId);
    if (!owner) return false;

    if (rule.source.type === 'skill') {
      const ch = CharacterRegistry.resolve(owner.generalName);
      if (!ch?.skills.some((s) => s.id === rule.source.id)) return false;
    }

    const condCtx: ConditionContext = {
      state: ctx.state,
      event: ctx.event,
      ownerPlayerId: ownerId,
    };
    if (!this.conditions.checkAll(rule.conditions, condCtx)) return false;

    if (rule.handler) {
      await this.interactions.run(rule.handler, {
        state: ctx.state,
        event: ctx.event,
        rule,
        ownerPlayerId: ownerId,
        log: ctx.log,
      });
      return false;
    }

    if (!rule.effects?.length) return false;

    const targetIds = ctx.event.payload.targetPlayerIds ?? [];
    const targets = ctx.state.players.filter((p) => targetIds.includes(p.id));

    const effectCtx: EffectExecutionContext = {
      state: ctx.state,
      event: ctx.event,
      source: owner,
      targets,
      log: ctx.log,
      deck: ctx.deck,
    };
    this.effects.runAll(rule.effects, effectCtx);
    return false;
  }
}

function inferPhaseFromTiming(timing: GameTiming): EventPhase {
  if (
    timing.startsWith('BEFORE_') ||
    timing === GameTiming.BEFORE_JUDGE ||
    timing === GameTiming.BEFORE_CARD_USED ||
    timing === GameTiming.BEFORE_DAMAGE
  ) {
    return 'pre';
  }
  if (timing === GameTiming.DAMAGE || timing === GameTiming.JUDGE) {
    return 'on';
  }
  return 'post';
}
