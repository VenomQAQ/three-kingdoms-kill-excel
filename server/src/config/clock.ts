/**
 * 全局时钟偏移（dev-only, BE-12）
 * 生产 ENABLE_DEBUG_CLOCK=false 时该 offset 恒为 0。
 * TokenService / LobbyChatService / RateLimiter 若需"快进"，应通过 Clock.now() 取时间；
 * 未接入 Clock.now() 的模块保留 Date.now()（本次 MVP 只让 refresh 过期检查等场景可测）。
 *
 * 本仓库主要用途：让 QA 触发 refresh 7d 过期，
 * 由 debug controller 直接调用 TokenService.forceExpireOlderThan(secondsAgo)。
 */
export class Clock {
  private static offsetMs = 0;

  static advance(seconds: number): void {
    this.offsetMs += Math.floor(seconds * 1000);
  }
  static reset(): void {
    this.offsetMs = 0;
  }
  static offset(): number {
    return this.offsetMs;
  }
  static now(): number {
    return Date.now() + this.offsetMs;
  }
}
