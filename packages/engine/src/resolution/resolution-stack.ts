import {
  type GameEvent,
  MAX_RESOLUTION_STACK_DEPTH,
} from '../types/event';

/**
 * LIFO 结算栈：无懈、濒死插入等「后发先至」。
 */
export class ResolutionStack {
  private readonly items: GameEvent[] = [];

  get depth(): number {
    return this.items.length;
  }

  peek(): GameEvent | undefined {
    return this.items[this.items.length - 1];
  }

  toArray(): readonly GameEvent[] {
    return [...this.items];
  }

  push(event: GameEvent): void {
    if (this.items.length >= MAX_RESOLUTION_STACK_DEPTH) {
      throw new Error(`Resolution stack overflow (max ${MAX_RESOLUTION_STACK_DEPTH})`);
    }
    this.items.push(event);
  }

  /** 濒死等：插入栈顶（下一帧先结算） */
  pushUrgent(event: GameEvent): void {
    if (this.items.length >= MAX_RESOLUTION_STACK_DEPTH) {
      throw new Error(`Resolution stack overflow (max ${MAX_RESOLUTION_STACK_DEPTH})`);
    }
    const priority = event.insertPriority ?? 0;
    let insertAt = this.items.length;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!.insertPriority ?? 0;
      if (priority > p) {
        insertAt = i;
      } else {
        break;
      }
    }
    this.items.splice(insertAt, 0, event);
  }

  pop(): GameEvent | undefined {
    return this.items.pop();
  }

  clear(): void {
    this.items.length = 0;
  }
}
