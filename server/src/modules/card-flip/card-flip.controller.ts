import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { CardFlipService } from './card-flip.service';

@Controller('api/card-flip')
export class CardFlipController {
  constructor(private readonly cardFlip: CardFlipService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.cardFlip.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { themeId?: string; difficultyId?: string }) {
    const data = await this.cardFlip.createSession(req.user!.userId, body);
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
    const data = await this.cardFlip.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
