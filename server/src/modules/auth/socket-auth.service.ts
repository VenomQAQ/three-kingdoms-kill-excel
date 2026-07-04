import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Server, Socket } from 'socket.io';
import { TokenService } from './token.service';
import { User } from './entities/user.entity';

/**
 * 从 socket handshake 的 Cookie 里解析 tk_at；无效则匿名。
 * 提供 emitToUser / disconnectByUser 供 auth.service 广播用。
 *
 * 注意：Socket.IO 的 handshake headers 里 cookie 是原始字符串，需要自解析。
 */
@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger('SocketAuthService');

  /** userId → socketIds */
  private readonly userSockets = new Map<string, Set<string>>();
  private server: Server | null = null;
  private nicknameChanged: ((userId: string, nickname: string) => void) | null = null;

  constructor(
    private readonly tokens: TokenService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  bindServer(server: Server): void {
    this.server = server;
  }

  bindNicknameChanged(callback: (userId: string, nickname: string) => void): void {
    this.nicknameChanged = callback;
  }

  /**
   * 在 handleConnection 里调用。返回 { userId, nickname, preferredVersion } | null（匿名）。
   * 副作用：把 socket 记入 userSockets（若已认证）。
   */
  async authenticate(client: Socket): Promise<{
    userId: string | null;
    nickname: string | null;
    preferredVersion: string;
  }> {
    const rawCookie = client.handshake.headers.cookie ?? '';
    const token = parseCookie(rawCookie, 'tk_at');
    if (!token) {
      return { userId: null, nickname: null, preferredVersion: 'standard-2014' };
    }
    const payload = this.tokens.verifyAccess(token);
    if (!payload) {
      return { userId: null, nickname: null, preferredVersion: 'standard-2014' };
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      return { userId: null, nickname: null, preferredVersion: 'standard-2014' };
    }

    // 记录 socket → user
    let set = this.userSockets.get(user.id);
    if (!set) {
      set = new Set();
      this.userSockets.set(user.id, set);
    }
    set.add(client.id);
    (client.data as any).userId = user.id;
    (client.data as any).nickname = user.nickname;

    return {
      userId: user.id,
      nickname: user.nickname,
      preferredVersion: user.preferredVersion,
    };
  }

  /**
   * 在 handleDisconnect 里调用，清理索引。
   */
  onDisconnect(client: Socket): void {
    const userId = (client.data as any).userId as string | undefined;
    if (!userId) return;
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) this.userSockets.delete(userId);
    }
  }

  /**
   * 向指定用户的所有 socket 广播事件。
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`emitToUser: server not bound (event=${event})`);
      return;
    }
    const set = this.userSockets.get(userId);
    if (!set || set.size === 0) return;
    for (const sid of set) {
      this.server.to(sid).emit(event as any, payload);
    }
  }

  updateUserNickname(userId: string, nickname: string): void {
    if (!this.server) return;
    const set = this.userSockets.get(userId);
    if (!set) return;
    for (const sid of set) {
      const socket = this.server.sockets.sockets.get(sid);
      if (socket) {
        (socket.data as any).nickname = nickname;
      }
    }
    this.nicknameChanged?.(userId, nickname);
  }

  /**
   * 强断某用户的所有 socket。
   * 打上 forceEvict 标记，让 gateway 的 handleDisconnect 立即回收（不走 5min 保坐）。
   */
  disconnectByUser(userId: string): number {
    if (!this.server) return 0;
    const set = this.userSockets.get(userId);
    if (!set) return 0;
    let count = 0;
    for (const sid of Array.from(set)) {
      const socket = this.server.sockets.sockets.get(sid);
      if (socket) {
        (socket.data as any).forceEvict = true;
        socket.disconnect(true);
        count += 1;
      }
    }
    return count;
  }

  /** 查询某用户在线 socket 数（测试/日志用） */
  countSocketsOf(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }
}

/**
 * 极简 cookie parser：Cookie 头形如 "a=1; b=2; c=xxx"，我们只找特定 key。
 * 不引入 cookie 包依赖。
 */
export function parseCookie(header: string, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}
