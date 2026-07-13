import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { TypingMazeFinishInput } from '@tk/shared';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { TypingMazeService } from './typing-maze.service';

@Controller('api/typing-maze')
export class TypingMazeController {
  constructor(private readonly typingMaze: TypingMazeService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.typingMaze.getConfig(), _v: 1 };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthedRequest, @Body() body: { modeId?: string }) {
    const data = await this.typingMaze.createSession(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/extend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async extend(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    const data = await this.typingMaze.extendSession(req.user!.userId, sessionId);
    return { ok: true, data, _v: 1 };
  }

  @Post('sessions/:sessionId/finish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async finish(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: TypingMazeFinishInput,
  ) {
    const data = await this.typingMaze.finishSession(req.user!.userId, sessionId, body);
    return { ok: true, data, _v: 1 };
  }
}
