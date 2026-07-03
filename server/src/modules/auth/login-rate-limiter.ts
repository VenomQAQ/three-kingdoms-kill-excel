import { Injectable } from '@nestjs/common';

/**
 * 简单固定窗口计数器 —— 用于登录失败限流。
 * key -> [失败次数, 窗口起点 ts]
 * 高级：可换 sliding window / Redis；MVP 内存实现足够。
 */
@Injectable()
export class LoginRateLimiter {
  private readonly ipMap = new Map<string, { count: number; resetAt: number }>();
  private readonly emailMap = new Map<string, { count: number; resetAt: number }>();

  private static readonly IP_WINDOW_MS = 60_000;      // 1 分钟
  private static readonly IP_LIMIT = 10;
  private static readonly EMAIL_WINDOW_MS = 3_600_000; // 1 小时
  private static readonly EMAIL_LIMIT = 5;

  /**
   * 检查是否已达上限（不递增）。用于 login 前置。
   */
  isBlocked(ip: string, email: string): boolean {
    const now = Date.now();
    const ipEntry = this.ipMap.get(ip);
    if (ipEntry && ipEntry.resetAt > now && ipEntry.count >= LoginRateLimiter.IP_LIMIT) {
      return true;
    }
    const emailEntry = this.emailMap.get(email);
    if (emailEntry && emailEntry.resetAt > now && emailEntry.count >= LoginRateLimiter.EMAIL_LIMIT) {
      return true;
    }
    return false;
  }

  /** 登录失败后调用 */
  recordFailure(ip: string, email: string): void {
    this.bump(this.ipMap, ip, LoginRateLimiter.IP_WINDOW_MS);
    this.bump(this.emailMap, email, LoginRateLimiter.EMAIL_WINDOW_MS);
  }

  /** 登录成功后清空（避免历史失败影响后续） */
  recordSuccess(ip: string, email: string): void {
    this.ipMap.delete(ip);
    this.emailMap.delete(email);
  }

  private bump(map: Map<string, { count: number; resetAt: number }>, key: string, window: number): void {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || entry.resetAt <= now) {
      map.set(key, { count: 1, resetAt: now + window });
    } else {
      entry.count += 1;
    }
  }
}
