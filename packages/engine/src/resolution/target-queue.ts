/**
 * FIFO 目标序：万箭、南蛮等按座位逆时针依次结算。
 * 与 ResolutionStack（LIFO）配合使用，不混在同一数据结构里。
 */
export class TargetQueue {
  private readonly queue: string[] = [];

  constructor(targetPlayerIds: string[]) {
    this.queue.push(...targetPlayerIds);
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  peek(): string | undefined {
    return this.queue[0];
  }

  shift(): string | undefined {
    return this.queue.shift();
  }

  toArray(): readonly string[] {
    return [...this.queue];
  }
}
