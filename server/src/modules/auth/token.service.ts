import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { ulid } from 'ulid';
import { env } from '../../config/env';
import { RefreshToken } from './entities/refresh-token.entity';

export interface AccessTokenPayload {
  sub: string;   // userId
  jti: string;   // 每次签发唯一 id（可选审计用）
  iat: number;
  exp: number;
}

export interface RefreshIssueResult {
  token: string;         // 明文 opaque token（存 Cookie 用）
  familyId: string;
  generation: number;
  expiresAt: Date;
}

export type RefreshRotationResult =
  | { ok: true; userId: string; refresh: RefreshIssueResult; access: string; accessExpiresIn: number }
  | { ok: false; code: 'E_REFRESH_EXPIRED' | 'E_REFRESH_REUSED'; reusedFamily?: boolean };

/**
 * Token 格式：<familyId>.<generation>.<secret>
 *   - familyId：ULID（同一次登录派生的一族）
 *   - generation：从 0 自增
 *   - secret：32 字节随机 base64url
 * 数据库只存 sha256(token) 的 hex；不明文落库。
 *
 * 5 秒竞态窗口（design §2.2）：
 *   若命中一个已 revoked 的记录且是"最近被旋转"（同 family 已存在更新的 generation），
 *     - (now - revokedAt) ≤ 5s → 视为重复请求，返回 E_REFRESH_REUSED 但不拉黑
 *     - (now - revokedAt) >  5s → 视为盗刷 → 整族 revoke，返回 E_REFRESH_REUSED (reusedFamily=true)
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger('TokenService');
  private static readonly REUSE_GRACE_MS = 5_000;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly rtRepo: Repository<RefreshToken>,
  ) {}

  // ---- Access ----

  signAccess(userId: string): { token: string; expiresInSec: number } {
    const expiresInSec = env.jwtAccessTtlSec;
    const token = jwt.sign(
      { sub: userId, jti: ulid() },
      env.jwtAccessSecret,
      { expiresIn: expiresInSec, algorithm: 'HS256' },
    );
    return { token, expiresInSec };
  }

  verifyAccess(token: string): AccessTokenPayload | null {
    try {
      return jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] }) as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  // ---- Refresh ----

  /**
   * 首次签发：新建 family，generation=0
   */
  async issueRefresh(userId: string, familyId?: string, generation = 0): Promise<RefreshIssueResult> {
    const fam = familyId ?? ulid();
    const secret = randomBytes(32).toString('base64url');
    const token = `${fam}.${generation}.${secret}`;
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + env.refreshTtlSec * 1000);

    await this.rtRepo.save(
      this.rtRepo.create({
        id: ulid(),
        userId,
        familyId: fam,
        generation,
        tokenHash,
        expiresAt,
        revokedAt: null,
        revokedReason: null,
      }),
    );

    return { token, familyId: fam, generation, expiresAt };
  }

  /**
   * 旋转：验证 → mark old revoked → 发 new
   */
  async rotate(rawToken: string): Promise<RefreshRotationResult> {
    const parsed = this.parseToken(rawToken);
    if (!parsed) return { ok: false, code: 'E_REFRESH_EXPIRED' };
    const { familyId, generation } = parsed;
    const tokenHash = this.hashToken(rawToken);

    const record = await this.rtRepo.findOne({ where: { tokenHash } });
    if (!record) return { ok: false, code: 'E_REFRESH_EXPIRED' };

    // 过期
    if (record.expiresAt.getTime() <= Date.now()) {
      return { ok: false, code: 'E_REFRESH_EXPIRED' };
    }

    // 已 revoked → 判 5s 竞态窗口
    if (record.revokedAt) {
      const gap = Date.now() - record.revokedAt.getTime();
      if (gap <= TokenService.REUSE_GRACE_MS) {
        this.logger.warn(`refresh reuse within grace (${gap}ms), userId=${record.userId} family=${familyId}`);
        return { ok: false, code: 'E_REFRESH_REUSED' };
      }
      // 盗刷：拉整族
      this.logger.warn(`refresh reuse detected (gap=${gap}ms), revoking family=${familyId} user=${record.userId}`);
      await this.revokeFamily(familyId, 'reused');
      return { ok: false, code: 'E_REFRESH_REUSED', reusedFamily: true };
    }

    // 正常旋转
    record.revokedAt = new Date();
    record.revokedReason = 'rotated';
    await this.rtRepo.save(record);

    const next = await this.issueRefresh(record.userId, familyId, generation + 1);
    const { token: access, expiresInSec } = this.signAccess(record.userId);
    return {
      ok: true,
      userId: record.userId,
      refresh: next,
      access,
      accessExpiresIn: expiresInSec,
    };
  }

  /**
   * 主动 revoke 某 family（logout / 盗刷）
   */
  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.rtRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('familyId = :familyId AND revokedAt IS NULL', { familyId })
      .execute();
  }

  /**
   * revoke 用户所有 refresh（改密 / admin）
   */
  async revokeAllByUser(userId: string, reason: string): Promise<void> {
    await this.rtRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
  }

  /**
   * 单条 revoke（仅当次 refresh）
   */
  async revokeByToken(rawToken: string, reason: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.rtRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('tokenHash = :tokenHash AND revokedAt IS NULL', { tokenHash })
      .execute();
  }

  /** 根据 refresh token 明文解析 userId（logout 等场景在 revoke 前调用） */
  async resolveUserIdByToken(rawToken: string): Promise<string | null> {
    const tokenHash = this.hashToken(rawToken);
    const row = await this.rtRepo.findOne({ where: { tokenHash } });
    return row?.userId ?? null;
  }

  /**
   * 清理过期记录（可选，供定时任务或启动时调用）
   */
  async purgeExpired(): Promise<number> {
    const result = await this.rtRepo.delete({ expiresAt: LessThanOrEqual(new Date()) });
    return result.affected ?? 0;
  }

  // ---- helpers ----

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseToken(token: string): { familyId: string; generation: number; secret: string } | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [familyId, genStr, secret] = parts;
    const generation = Number(genStr);
    if (!familyId || !secret || !Number.isInteger(generation) || generation < 0) return null;
    return { familyId, generation, secret };
  }
}
