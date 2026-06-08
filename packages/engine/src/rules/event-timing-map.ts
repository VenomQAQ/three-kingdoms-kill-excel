import { GameEventType } from '../types/event';
import type { EventPhase } from '../types/event';
import { GameTiming } from '../types/timing';

/** 事件类型 × 结算阶段 → GameTiming（配置技能挂载点） */
export function resolveEventTiming(
  type: GameEventType,
  phase: EventPhase,
): GameTiming | null {
  switch (type) {
    case GameEventType.USE_CARD:
      if (phase === 'pre') return GameTiming.BEFORE_CARD_USED;
      if (phase === 'post') return GameTiming.CARD_USED;
      return null;
    case GameEventType.TAKE_DAMAGE:
      if (phase === 'pre') return GameTiming.BEFORE_DAMAGE;
      if (phase === 'on') return GameTiming.DAMAGE;
      if (phase === 'post') return GameTiming.AFTER_DAMAGE;
      return null;
    case GameEventType.JUDGE:
      if (phase === 'pre') return GameTiming.BEFORE_JUDGE;
      if (phase === 'on') return GameTiming.JUDGE;
      if (phase === 'post') return GameTiming.AFTER_JUDGE;
      return null;
    case GameEventType.DYING:
      return GameTiming.DYING;
    case GameEventType.DEATH:
      return GameTiming.DEATH;
    default:
      return null;
  }
}
