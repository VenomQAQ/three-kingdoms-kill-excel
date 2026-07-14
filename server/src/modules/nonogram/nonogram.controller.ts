import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { NonogramService } from './nonogram.service';

@Controller('api/nonogram')
export class NonogramController {
  constructor(private readonly nonogram: NonogramService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.nonogram.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { difficultyId?: string }) {
    const data = await this.nonogram.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { result?: 'won' | 'lost'; board?: boolean[][]; mistakes?: number },
  ) {
    const data = await this.nonogram.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
