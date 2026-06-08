import type { GamePrompt } from '../types/game';
import type { EnginePlayerState } from '../types/game';
import { GameTiming } from '../types/timing';
import {
  applyLockedModifiers,
  characterSkillsForPrompt,
  collectReactiveSkillOffers,
  type TimingContext,
} from './timing-runner';

export type { TimingContext } from './timing-runner';

export interface TimingEmitResult {
  /** 是否因 prompt 暂停了流水线 */
  paused: boolean;
  ctx: TimingContext;
}

export type TimingListener = (
  timing: GameTiming,
  ctx: TimingContext,
) => void | Partial<TimingEmitResult>;

/** 引擎向事件层暴露的最小宿主接口（避免 EventManager 与 GameEngine 循环依赖） */
export interface EventManagerHost {
  log(message: string): void;
  getPlayers(): EnginePlayerState[];
  currentPlayer(): EnginePlayerState | undefined;
  getPrompt(): GamePrompt | null;
  setPrompt(prompt: GamePrompt | null): void;
  nextPromptId(): string;
  /** 摸牌前 / 出牌阶段等主动技询问 */
  offerOptionalSkills(timing: GameTiming): void;
}

type CoreHandler = (ctx: TimingContext) => Partial<TimingEmitResult> | void;

/**
 * 游戏事件管理器 — 统一派发 GameTiming，支持监听扩展与内置结算钩子。
 *
 * 架构角色：
 * - FSM（turnPhase）决定「何时」进入某阶段
 * - EventManager 在阶段内/结算点派发「时机」并触发技能挂载
 */
export class EventManager {
  private readonly coreHandlers = new Map<GameTiming, CoreHandler>();
  private readonly customListeners = new Map<GameTiming, TimingListener[]>();

  constructor(private readonly host: EventManagerHost) {
    this.registerCoreHandlers();
  }

  /** 注册自定义监听（返回取消函数） */
  on(timing: GameTiming, listener: TimingListener): () => void {
    const list = this.customListeners.get(timing) ?? [];
    list.push(listener);
    this.customListeners.set(timing, list);
    return () => {
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /** 派发时机；返回是否已暂停等待 prompt */
  emit(timing: GameTiming, ctx: TimingContext): TimingEmitResult {
    let current: TimingContext = { ...ctx };

    for (const listener of this.customListeners.get(timing) ?? []) {
      const patch = listener(timing, current);
      if (patch?.ctx) current = patch.ctx;
      if (patch?.paused) return { paused: true, ctx: current };
    }

    const core = this.coreHandlers.get(timing);
    if (core) {
      const patch = core(current);
      if (patch?.ctx) current = patch.ctx;
      if (patch?.paused) return { paused: true, ctx: current };
    }

    return { paused: false, ctx: current };
  }

  /** 锁定技：修改响应次数等（在卡牌结算前由引擎显式调用） */
  applyLockedModifiers(ctx: TimingContext): void {
    applyLockedModifiers(ctx);
  }

  private registerCoreHandlers(): void {
    this.coreHandlers.set(GameTiming.TURN_START, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.TURN_START}] ${ctx.source.generalName} 回合`);
      }
    });

    this.coreHandlers.set(GameTiming.BEFORE_JUDGE, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.BEFORE_JUDGE}] ${ctx.source.generalName}`);
      }
    });

    this.coreHandlers.set(GameTiming.JUDGE, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.JUDGE}] ${ctx.source.generalName}`);
      }
    });

    this.coreHandlers.set(GameTiming.AFTER_JUDGE, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.AFTER_JUDGE}] ${ctx.source.generalName}`);
      }
    });

    this.coreHandlers.set(GameTiming.PHASE_PLAY, () => {
      this.host.offerOptionalSkills(GameTiming.PHASE_PLAY);
      if (this.host.getPrompt()) return { paused: true };
    });

    this.coreHandlers.set(GameTiming.CARD_USED, (ctx) => {
      if (ctx.source && ctx.card) {
        this.host.log(
          `[${GameTiming.CARD_USED}] ${ctx.source.generalName} →【${ctx.card.name}】`,
        );
      }
    });

    this.coreHandlers.set(GameTiming.EQUIP, (ctx) => {
      if (ctx.source && ctx.card) {
        this.host.log(
          `[${GameTiming.EQUIP}] ${ctx.source.generalName} 装备【${ctx.card.name}】`,
        );
      }
    });

    this.coreHandlers.set(GameTiming.BEFORE_DAMAGE, (ctx) => {
      if (ctx.targets?.[0] && ctx.damageAmount != null) {
        this.host.log(
          `[${GameTiming.BEFORE_DAMAGE}] ${ctx.targets[0].generalName} 将受到 ${ctx.damageAmount} 点伤害`,
        );
      }
    });

    this.coreHandlers.set(GameTiming.DAMAGE, (ctx) => {
      if (ctx.targets?.[0] && ctx.damageAmount != null) {
        this.host.log(`[${GameTiming.DAMAGE}] 伤害结算中`);
      }
    });

    this.coreHandlers.set(GameTiming.AFTER_DAMAGE, (ctx) => {
      const victim = ctx.targets?.[0];
      if (!victim) return;
      const offers = collectReactiveSkillOffers(victim, GameTiming.AFTER_DAMAGE);
      if (offers.length === 0 || this.host.getPrompt()) return;

      const offer = offers[0]!;
      this.host.setPrompt({
        id: this.host.nextPromptId(),
        type: 'use_skill',
        playerId: victim.id,
        characterSkills: characterSkillsForPrompt(victim),
        message: offer.message,
        options: [
          { id: `skill:${offer.skill.id}`, label: `发动【${offer.skill.name}】` },
          { id: 'skip', label: '不发动' },
        ],
      });
      return { paused: true };
    });

    this.coreHandlers.set(GameTiming.PHASE_END, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.PHASE_END}] ${ctx.source.generalName}`);
      }
    });

    this.coreHandlers.set(GameTiming.TURN_END, (ctx) => {
      if (ctx.source) {
        this.host.log(`[${GameTiming.TURN_END}] ${ctx.source.generalName}`);
      }
    });
  }
}
