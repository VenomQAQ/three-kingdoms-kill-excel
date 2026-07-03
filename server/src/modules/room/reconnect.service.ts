import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

/**
 * 断线保坐：REQ-2026-001 R-4
 *
 * 语义：某 userId 断线后，5 分钟内若同一 userId 重连，则座位/引擎绑定原样保留。
 *   超时才真正调用 evict(userId) 由 RoomService 回收。
 *   改密广播强断（socket.data.forceEvict = true）→ 不走 schedule，立刻 evict。
 *
 * 数据结构：Map<userId, Timeout>；一个用户只保留一次 pending。
 */
@Injectable()
export class ReconnectService {
  private readonly logger = new Logger('ReconnectService');
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private evictor: ((userId: string) => void) | null = null;

  /**
   * 由 RoomService 在 onModuleInit 时注入 evict 回调（避免循环依赖）。
   */
  bindEvictor(evictor: (userId: string) => void): void {
    this.evictor = evictor;
  }

  /**
   * 断线时调用（gateway.handleDisconnect）。
   * @returns 是否真的挂了计时器（false = 立即回收 or 无需保坐）
   */
  scheduleReclaim(userId: string, immediate = false): boolean {
    if (!userId) return false;
    if (immediate) {
      this.logger.log(`immediate evict user=${userId}`);
      this.evictor?.(userId);
      return false;
    }
    // 如已有 pending，覆盖并清除旧计时器
    const old = this.pending.get(userId);
    if (old) clearTimeout(old);

    const timeout = setTimeout(() => {
      this.pending.delete(userId);
      this.logger.log(`reclaim executed user=${userId}`);
      this.evictor?.(userId);
    }, env.reconnectGraceSec * 1000);
    this.pending.set(userId, timeout);
    this.logger.log(`reclaim scheduled user=${userId} in ${env.reconnectGraceSec}s`);
    return true;
  }

  /**
   * 重连时调用（gateway.handleConnection 认证成功后）。
   * 若命中 pending，取消超时并返回 true —— 上层据此走 rebind。
   */
  cancelReclaim(userId: string): boolean {
    const t = this.pending.get(userId);
    if (!t) return false;
    clearTimeout(t);
    this.pending.delete(userId);
    this.logger.log(`reclaim cancelled user=${userId}`);
    return true;
  }

  hasPending(userId: string): boolean {
    return this.pending.has(userId);
  }
}
