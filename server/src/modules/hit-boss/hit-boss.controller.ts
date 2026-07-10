import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { HitBossService } from './hit-boss.service';

@Controller('api/hit-boss')
export class HitBossController {
  constructor(private readonly hitBoss: HitBossService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.hitBoss.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { difficultyId?: string }) {
    const data = await this.hitBoss.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/extend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async extend(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    const data = await this.hitBoss.extendSession(req.user!.userId, sessionId);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { result?: 'won' | 'lost'; bossesHit?: number; missHits?: number },
  ) {
    const data = await this.hitBoss.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
