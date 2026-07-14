import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { NonogramSession } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import { NonogramSessionEntity } from './entities/nonogram-session.entity';
import { NONOGRAM_CONFIG } from './nonogram.config';
import { boardsEqual, generateNonogramPuzzle } from './nonogram.generator';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class NonogramService {
  constructor(
    @InjectRepository(NonogramSessionEntity)
    private readonly sessionRepo: Repository<NonogramSessionEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig() {
    return NONOGRAM_CONFIG;
  }

  async createSession(userId: string, input: { difficultyId?: string }) {
    const existingPlaying = await this.sessionRepo.findOne({ where: { userId, status: 'playing' } });
    if (existingPlaying) {
      // 再次点「开始」视为放弃旧局、扣费开新局（不返还旧局入场费、无通关奖励）
      existingPlaying.status = 'lost';
      existingPlaying.finishedAt = new Date();
      await this.sessionRepo.save(existingPlaying);
    }

    const difficultyId = input.difficultyId || NONOGRAM_CONFIG.defaultDifficultyId;
    const difficulty = NONOGRAM_CONFIG.difficulties.find((item) => item.difficultyId === difficultyId);
    if (!difficulty) codedBad(ErrorCodes.NONOGRAM_INVALID_CONFIG, '数织游戏配置不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    const entryFee = NONOGRAM_CONFIG.entryFee;
    if (user.coins < entryFee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法开始本局');
    }

    const puzzle = generateNonogramPuzzle(difficulty.size);
    const now = new Date();
    user.coins -= entryFee;
    await this.userRepo.save(user);

    const entity = await this.sessionRepo.save(
      this.sessionRepo.create({
        id: ulid(),
        userId,
        difficultyId: difficulty.difficultyId,
        status: 'playing',
        size: difficulty.size,
        entryFee,
        rewardCoins: difficulty.rewardCoins,
        maxMistakes: NONOGRAM_CONFIG.maxMistakes,
        rowCluesJson: JSON.stringify(puzzle.rowClues),
        colCluesJson: JSON.stringify(puzzle.colClues),
        solutionJson: JSON.stringify(puzzle.solution),
        digitsJson: JSON.stringify(puzzle.digits),
        startedAt: now,
        finishedAt: null,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'nonogram-entry');
    return { session: this.toSession(entity), wallet, _v: 1 as const };
  }

  async finishSession(
    userId: string,
    sessionId: string,
    input: { result?: 'won' | 'lost'; board?: boolean[][]; mistakes?: number },
  ) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({
        ok: false,
        code: ErrorCodes.NONOGRAM_SESSION_NOT_FOUND,
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

    const solution = JSON.parse(entity.solutionJson) as boolean[][];
    const now = new Date();
    let isWin = false;

    if (input.result === 'won') {
      if (!Array.isArray(input.board) || !boardsEqual(input.board, solution)) {
        codedBad(ErrorCodes.NONOGRAM_INVALID_RESULT, '盘面未完成或有误，无法通关');
      }
      const mistakes = typeof input.mistakes === 'number' ? input.mistakes : 0;
      if (mistakes > entity.maxMistakes) {
        codedBad(ErrorCodes.NONOGRAM_INVALID_RESULT, '失误次数超限，无法通关');
      }
      isWin = true;
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
    if (rewardCoins > 0) this.emitWallet(userId, wallet, 'nonogram-reward');
    return {
      sessionId: entity.id,
      status: entity.status,
      rewardCoins,
      wallet,
      alreadySettled: false,
      _v: 1 as const,
    };
  }

  private toSession(entity: NonogramSessionEntity): NonogramSession {
    const size = entity.size;
    let digits: number[][] = [];
    try {
      digits = entity.digitsJson ? (JSON.parse(entity.digitsJson) as number[][]) : [];
    } catch {
      digits = [];
    }
    if (!Array.isArray(digits) || digits.length !== size) {
      digits = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => Math.floor(Math.random() * 9) + 1),
      );
    }
    return {
      sessionId: entity.id,
      difficultyId: entity.difficultyId as NonogramSession['difficultyId'],
      status: entity.status,
      size,
      entryFee: entity.entryFee,
      rewardCoins: entity.rewardCoins,
      maxMistakes: entity.maxMistakes,
      rowClues: JSON.parse(entity.rowCluesJson) as number[][],
      colClues: JSON.parse(entity.colCluesJson) as number[][],
      solution: JSON.parse(entity.solutionJson) as boolean[][],
      digits,
      startedAt: entity.startedAt.getTime(),
      finishedAt: entity.finishedAt?.getTime(),
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
