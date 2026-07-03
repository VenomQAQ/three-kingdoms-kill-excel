import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { LobbyChatMessage } from './entities/lobby-chat-message.entity';
import { ChatRateLimiter } from './rate-limiter';

export interface LobbyChatMessageDto {
  id: string;
  userId: string;
  nickname: string;
  content: string;
  ts: number;
  _v: 1;
}

export type SendResult =
  | { ok: true; message: LobbyChatMessageDto }
  | { ok: false; code: string; message: string };

/**
 * BE-9：大厅聊天服务
 * - 存储滚动窗口 1000 条（超出淘汰最老）
 * - 首拉快照 100 条
 * - 限流 1 QPS / userId
 * - 长度 ≤ 200 字符（Unicode 码点）
 */
@Injectable()
export class LobbyChatService {
  private readonly logger = new Logger('LobbyChatService');

  static readonly HISTORY_SIZE = 1000;
  static readonly SNAPSHOT_SIZE = 100;
  static readonly MAX_LENGTH = 200;

  constructor(
    @InjectRepository(LobbyChatMessage)
    private readonly repo: Repository<LobbyChatMessage>,
    private readonly limiter: ChatRateLimiter,
  ) {}

  async send(userId: string, nickname: string, rawContent: string): Promise<SendResult> {
    const content = typeof rawContent === 'string' ? rawContent : '';
    // Unicode 码点计数（不用 length，避免代理对错误计数）
    const codePoints = [...content];
    if (codePoints.length === 0) {
      return { ok: false, code: ErrorCodes.CHAT_TOO_LONG, message: '消息不能为空' };
    }
    if (codePoints.length > LobbyChatService.MAX_LENGTH) {
      return { ok: false, code: ErrorCodes.CHAT_TOO_LONG, message: `单条消息 ≤ ${LobbyChatService.MAX_LENGTH} 字符` };
    }
    if (!this.limiter.tryAcquire(userId)) {
      return { ok: false, code: ErrorCodes.CHAT_RATE_LIMIT, message: '发送过快，请稍后再试' };
    }

    const now = Date.now();
    const msg = await this.repo.save(
      this.repo.create({
        id: ulid(),
        userId,
        nickname,
        content,
        ts: now,
      }),
    );
    // 滚动淘汰（每 10 次插入触发一次，减轻负担）
    if (Math.random() < 0.1) void this.evictOldIfNeeded();
    else void this.evictOldIfNeededSoft();

    return {
      ok: true,
      message: {
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        content: msg.content,
        ts: Number(msg.ts),
        _v: 1,
      },
    };
  }

  /** 匿名 / 已登录都可调用；返回最近 100 条，时间升序 */
  async snapshot(): Promise<LobbyChatMessageDto[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .orderBy('m.ts', 'DESC')
      .limit(LobbyChatService.SNAPSHOT_SIZE)
      .getMany();
    return rows
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        nickname: r.nickname,
        content: r.content,
        ts: Number(r.ts),
        _v: 1 as const,
      }))
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * 每次写入后：若总数 > 1000，删除最老那些。批处理减轻负担。
   */
  private async evictOldIfNeeded(): Promise<void> {
    try {
      const count = await this.repo.count();
      if (count <= LobbyChatService.HISTORY_SIZE) return;
      const excess = count - LobbyChatService.HISTORY_SIZE;
      const oldest = await this.repo
        .createQueryBuilder('m')
        .orderBy('m.ts', 'ASC')
        .limit(excess)
        .getMany();
      if (oldest.length > 0) {
        await this.repo.delete(oldest.map((x) => x.id));
        this.logger.log(`evicted ${oldest.length} old lobby messages`);
      }
    } catch (err) {
      this.logger.warn(`evictOld failed: ${(err as Error).message}`);
    }
  }

  /** 低频兜底：只删溢出 1 条，避免每次都全扫 */
  private async evictOldIfNeededSoft(): Promise<void> {
    try {
      const count = await this.repo.count();
      if (count <= LobbyChatService.HISTORY_SIZE) return;
      const oldest = await this.repo
        .createQueryBuilder('m')
        .orderBy('m.ts', 'ASC')
        .limit(1)
        .getOne();
      if (oldest) {
        await this.repo.delete(oldest.id);
      }
    } catch {
      // ignore
    }
  }
}
