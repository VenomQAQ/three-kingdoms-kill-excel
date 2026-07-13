import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { SumTo10Session } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import { SumTo10SessionEntity } from './entities/sum-to-10-session.entity';
import { SUM_TO_10_CONFIG } from './sum-to-10.config';
import { buildSumTo10Board } from './sum-to-10.generator';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class SumTo10Service {
  constructor(
    @InjectRepository(SumTo10SessionEntity)
    private readonly sessionRepo: Repository<SumTo10SessionEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig() {
    return SUM_TO_10_CONFIG;
  }

  async createSession(userId: string, input: { difficultyId?: string }) {
    const existingPlaying = await this.sessionRepo.findOne({ where: { userId, status: 'playing' } });
    if (existingPlaying) {
      if (Date.now() > existingPlaying.deadlineAt.getTime()) {
        existingPlaying.status = 'expired';
        existingPlaying.finishedAt = new Date();
        await this.sessionRepo.save(existingPlaying);
      } else {
        return {
          session: this.toSession(existingPlaying),
          wallet: await this.loadWallet(userId),
          _v: 1 as const,
        };
      }
    }

    const difficultyId = input.difficultyId || SUM_TO_10_CONFIG.defaultDifficultyId;
    const difficulty = SUM_TO_10_CONFIG.difficulties.find((item) => item.difficultyId === difficultyId);
    if (!difficulty) codedBad(ErrorCodes.SUM_TO_10_INVALID_CONFIG, '合10游戏配置不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    const entryFee = SUM_TO_10_CONFIG.entryFee;
    if (user.coins < entryFee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法开始本局');
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + difficulty.timeLimitSec * 1000);
    const board = buildSumTo10Board(difficulty.rows, difficulty.cols);
    user.coins -= entryFee;
    await this.userRepo.save(user);

    const entity = await this.sessionRepo.save(
      this.sessionRepo.create({
        id: ulid(),
        userId,
        difficultyId: difficulty.difficultyId,
        status: 'playing',
        rows: difficulty.rows,
        cols: difficulty.cols,
        targetScore: difficulty.targetScore,
        timeLimitSec: difficulty.timeLimitSec,
        entryFee,
        rewardCoins: difficulty.rewardCoins,
        boardJson: JSON.stringify(board),
        startedAt: now,
        deadlineAt,
        finishedAt: null,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'sum-to-10-entry');
    return { session: this.toSession(entity), wallet, _v: 1 as const };
  }

  async finishSession(
    userId: string,
    sessionId: string,
    input: { result?: 'won' | 'lost'; score?: number },
  ) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({
        ok: false,
        code: ErrorCodes.SUM_TO_10_SESSION_NOT_FOUND,
        message: '本局已失效',
        _v: 1,
      });
    }

    if (entity.status !== 'playing') {
      return {
        sessionId: entity.id,
        status: entity.status,
        rewardCoins: entity.status === 'won' ? entity.rewardCoins : 0,
        wallet: await this.loadWallet(userId),
        alreadySettled: true,
        _v: 1 as const,
      };
    }

    const now = new Date();
    const score = typeof input.score === 'number' && Number.isFinite(input.score)
      ? Math.max(0, Math.floor(input.score))
      : 0;
    const isWin = input.result === 'won' && score >= entity.targetScore;
    if (isWin && now.getTime() > entity.deadlineAt.getTime() + 2000) {
      entity.status = 'expired';
      entity.finishedAt = now;
      await this.sessionRepo.save(entity);
      codedBad(ErrorCodes.SUM_TO_10_SESSION_EXPIRED, '已超时，挑战失败');
    }
    if (input.result === 'won' && score < entity.targetScore) {
      codedBad(ErrorCodes.SUM_TO_10_INVALID_RESULT, '积分未达标，无法通关');
    }

    entity.status = isWin ? 'won' : 'lost';
    entity.finishedAt = now;
    await this.sessionRepo.save(entity);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    const rewardCoins = isWin ? entity.rewardCoins : 0;
    if (rewardCoins > 0) {
      user.coins += rewardCoins;
      await this.userRepo.save(user);
    }

    const wallet = this.toWallet(user);
    if (rewardCoins > 0) this.emitWallet(userId, wallet, 'sum-to-10-reward');
    return {
      sessionId: entity.id,
      status: entity.status,
      rewardCoins,
      wallet,
      alreadySettled: false,
      _v: 1 as const,
    };
  }

  private toSession(entity: SumTo10SessionEntity): SumTo10Session {
    return {
      sessionId: entity.id,
      difficultyId: entity.difficultyId as SumTo10Session['difficultyId'],
      status: entity.status,
      rows: entity.rows,
      cols: entity.cols,
      targetScore: entity.targetScore,
      timeLimitSec: entity.timeLimitSec,
      entryFee: entity.entryFee,
      rewardCoins: entity.rewardCoins,
      startedAt: entity.startedAt.getTime(),
      deadlineAt: entity.deadlineAt.getTime(),
      finishedAt: entity.finishedAt?.getTime(),
      board: JSON.parse(entity.boardJson),
      _v: 1,
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
