import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CrimeSudokuConfig, CrimeSudokuProgressView } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import {
  CRIME_SUDOKU_HINT_COST,
  CRIME_SUDOKU_MAX_HINTS,
  CRIME_SUDOKU_SERVER_LEVELS,
} from './crime-sudoku.config';
import { CrimeSudokuClearEntity } from './entities/crime-sudoku-clear.entity';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class CrimeSudokuService {
  constructor(
    @InjectRepository(CrimeSudokuClearEntity)
    private readonly clearRepo: Repository<CrimeSudokuClearEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig(): CrimeSudokuConfig {
    return {
      levels: CRIME_SUDOKU_SERVER_LEVELS.map((level) => ({ ...level })),
      hintCost: CRIME_SUDOKU_HINT_COST,
      maxHints: CRIME_SUDOKU_MAX_HINTS,
      _v: 1,
    };
  }

  async getProgress(userId: string): Promise<CrimeSudokuProgressView> {
    const rows = await this.clearRepo.find({ where: { userId } });
    return {
      clears: rows.map((row) => ({
        levelId: row.levelId,
        clearTimeMs: row.clearTimeMs,
        claimedAt: row.createdAt.getTime(),
      })),
      _v: 1,
    };
  }

  async claimClear(userId: string, input: { levelId?: string; clearTimeMs?: number }) {
    const level = CRIME_SUDOKU_SERVER_LEVELS.find((item) => item.id === input.levelId);
    if (!level) codedBad(ErrorCodes.CS_INVALID_LEVEL, '关卡不存在');

    const clearTimeMs = Math.max(0, Math.floor(Number(input.clearTimeMs) || 0));
    const existing = await this.clearRepo.findOne({ where: { userId, levelId: level.id } });
    if (existing) {
      return {
        levelId: level.id,
        rewardCoins: 0,
        clearTimeMs: existing.clearTimeMs,
        alreadyClaimed: true,
        wallet: await this.loadWallet(userId),
        _v: 1 as const,
      };
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }

    user.coins += level.rewardCoins;
    await this.userRepo.save(user);
    await this.clearRepo.save(
      this.clearRepo.create({
        id: ulid(),
        userId,
        levelId: level.id,
        clearTimeMs,
        rewardCoins: level.rewardCoins,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'crime-sudoku-reward');
    return {
      levelId: level.id,
      rewardCoins: level.rewardCoins,
      clearTimeMs,
      alreadyClaimed: false,
      wallet,
      _v: 1 as const,
    };
  }

  async useHint(userId: string, input: { levelId?: string; hintsUsedBefore?: number }) {
    const level = CRIME_SUDOKU_SERVER_LEVELS.find((item) => item.id === input.levelId);
    if (!level) codedBad(ErrorCodes.CS_INVALID_LEVEL, '关卡不存在');

    const hintsUsedBefore = Math.max(0, Math.floor(Number(input.hintsUsedBefore) || 0));
    if (hintsUsedBefore >= level.maxHints) {
      codedBad(ErrorCodes.CS_HINT_LIMIT, `本局提示已用完（最多 ${level.maxHints} 次）`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    if (user.coins < level.hintCost) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法使用提示');
    }

    user.coins -= level.hintCost;
    await this.userRepo.save(user);
    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'crime-sudoku-hint');
    return {
      levelId: level.id,
      hintCost: level.hintCost,
      hintsUsed: hintsUsedBefore + 1,
      maxHints: level.maxHints,
      wallet,
      _v: 1 as const,
    };
  }

  private async loadWallet(userId: string): Promise<WalletView> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return { coins: 0, experience: 0, level: 1 };
    return this.toWallet(user);
  }

  private toWallet(user: User): WalletView {
    return { coins: user.coins, experience: user.experience, level: user.level };
  }

  private emitWallet(userId: string, wallet: WalletView, reason: string): void {
    this.socketAuth.emitToUser(userId, 'user:walletChanged', { ...wallet, reason, _v: 1 });
  }
}
