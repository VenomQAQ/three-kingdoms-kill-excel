import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { SumTo10Service } from './sum-to-10.service';

@Controller('api/sum-to-10')
export class SumTo10Controller {
  constructor(private readonly sumTo10: SumTo10Service) {}

  @Get('config')
  config() {
    return { ok: true, data: this.sumTo10.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { difficultyId?: string }) {
    const data = await this.sumTo10.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { result?: 'won' | 'lost'; score?: number },
  ) {
    const data = await this.sumTo10.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
