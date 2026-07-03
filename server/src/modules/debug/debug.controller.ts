import { Body, Controller, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clock } from '../../config/clock';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

/**
 * dev-only（BE-12）：QA 时间快进。
 * - /api/debug/advance-clock { seconds }：全局 Clock 偏移
 * - 同时把 refresh_token.expiresAt 也向前拨（因为过期检查用 Date.now 而非 Clock.now，
 *   若后续切到 Clock.now 则本步可省。此处双写以确保 QA 可复现 refresh 7d 过期）。
 */
@Controller('api/debug')
export class DebugController {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly rtRepo: Repository<RefreshToken>,
  ) {}

  @Post('advance-clock')
  async advance(@Body() body: { seconds: number }) {
    const seconds = Math.max(0, Math.floor(Number(body?.seconds) || 0));
    Clock.advance(seconds);

    // 把所有 refresh_token 的 expiresAt / revokedAt 拨向"过去"
    // 这样过期 / grace 判定的 Date.now() 会命中 QA 想测的分支
    if (seconds > 0) {
      await this.rtRepo
        .createQueryBuilder()
        .update(RefreshToken)
        .set({
          expiresAt: () => `datetime(expiresAt, '-${seconds} seconds')`,
        })
        .execute();
      await this.rtRepo
        .createQueryBuilder()
        .update(RefreshToken)
        .set({
          revokedAt: () => `CASE WHEN revokedAt IS NULL THEN NULL ELSE datetime(revokedAt, '-${seconds} seconds') END`,
        })
        .execute();
    }

    return {
      ok: true,
      data: { advancedBy: seconds, currentOffsetMs: Clock.offset() },
      _v: 1,
    };
  }
}
