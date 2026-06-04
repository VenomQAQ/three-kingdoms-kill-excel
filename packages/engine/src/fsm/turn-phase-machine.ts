import type { TurnPhase } from '../types/timing';

const ORDER: TurnPhase[] = ['judge', 'before_draw', 'draw', 'play', 'discard', 'end'];

/**
 * 回合阶段 FSM：只负责宏观阶段流转，不负责卡牌结算栈。
 */
export class TurnPhaseMachine {
  constructor(private phase: TurnPhase = 'judge') {}

  get current(): TurnPhase {
    return this.phase;
  }

  set(phase: TurnPhase): void {
    this.phase = phase;
  }

  advance(): TurnPhase {
    const idx = ORDER.indexOf(this.phase);
    if (idx < 0 || idx >= ORDER.length - 1) {
      this.phase = 'judge';
      return this.phase;
    }
    this.phase = ORDER[idx + 1]!;
    return this.phase;
  }

  reset(): void {
    this.phase = 'judge';
  }
}
