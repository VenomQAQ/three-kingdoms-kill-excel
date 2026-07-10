import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { ReconCheckFinishInput } from '@tk/shared';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { ReconCheckService } from './recon-check.service';

@Controller('api/recon-check')
export class ReconCheckController {
  constructor(private readonly reconCheck: ReconCheckService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.reconCheck.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { difficultyId?: string }) {
    const data = await this.reconCheck.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/extend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async extend(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    const data = await this.reconCheck.extendSession(req.user!.userId, sessionId);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: ReconCheckFinishInput,
  ) {
    const data = await this.reconCheck.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
