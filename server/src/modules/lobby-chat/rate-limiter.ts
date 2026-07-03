import { Injectable } from '@nestjs/common';

/**
 * 滑动窗口限流（BE-9）：单账号 1 QPS。
 * 简易实现：记录 userId → 最近一次通过时刻；间隔 < 1000ms 拒绝。
 * 高级：可换成"1 秒内 N 条"的滑窗；MVP 单条足够。
 */
@Injectable()
export class ChatRateLimiter {
  private readonly last = new Map<string, number>();
  private static readonly MIN_INTERVAL_MS = 1_000;

  /** 尝试通过 —— true 允许，false 命中限流 */
  tryAcquire(userId: string): boolean {
    const now = Date.now();
    const prev = this.last.get(userId) ?? 0;
    if (now - prev < ChatRateLimiter.MIN_INTERVAL_MS) return false;
    this.last.set(userId, now);
    return true;
  }
}
