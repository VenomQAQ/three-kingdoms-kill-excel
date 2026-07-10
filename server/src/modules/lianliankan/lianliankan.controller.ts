import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { LianliankanTile } from '@tk/shared';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { LianliankanService } from './lianliankan.service';

@Controller('api/lianliankan')
export class LianliankanController {
  constructor(private readonly lianliankan: LianliankanService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.lianliankan.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { themeId?: string; difficultyId?: string; mode?: 'solo' | 'race' }) {
    const data = await this.lianliankan.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { result?: 'won' | 'lost'; remainingTiles?: number },
  ) {
    const data = await this.lianliankan.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async refresh(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { remainingTiles?: LianliankanTile[] },
  ) {
    const remainingTiles = Array.isArray(body?.remainingTiles) ? body.remainingTiles : [];
    const data = await this.lianliankan.refreshSession(req.user!.userId, sessionId, remainingTiles);
    return { ok: true, data, _v: 1 };
  }
}
