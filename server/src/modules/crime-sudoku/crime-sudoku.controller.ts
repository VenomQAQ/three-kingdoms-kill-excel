import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthedRequest } from '../auth/auth.guard';
import { CrimeSudokuService } from './crime-sudoku.service';

@Controller('api/crime-sudoku')
export class CrimeSudokuController {
  constructor(private readonly crimeSudoku: CrimeSudokuService) {}

  @Get('config')
  config() {
    return { ok: true, data: this.crimeSudoku.getConfig(), _v: 1 };
  }

  @Get('progress')
  @UseGuards(AuthGuard)
  async progress(@Req() req: AuthedRequest) {
    const data = await this.crimeSudoku.getProgress(req.user!.userId);
    return { ok: true, data, _v: 1 };
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async claim(
    @Req() req: AuthedRequest,
    @Body() body: { levelId?: string; clearTimeMs?: number },
  ) {
    const data = await this.crimeSudoku.claimClear(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }

  @Post('hint')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async hint(
    @Req() req: AuthedRequest,
    @Body() body: { levelId?: string; hintsUsedBefore?: number },
  ) {
    const data = await this.crimeSudoku.useHint(req.user!.userId, body);
    return { ok: true, data, _v: 1 };
  }
}
