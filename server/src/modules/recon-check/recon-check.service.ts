import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ReconCheckFinishInput, ReconCheckSession } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import { ReconCheckSessionEntity } from './entities/recon-check-session.entity';
import { RECON_CHECK_CONFIG } from './recon-check.config';
import {
  generateReconRounds,
  setsEqual,
  toPublicBoards,
  type ReconCheckRoundInternal,
} from './recon-check.generator';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class ReconCheckService {
  constructor(
    @InjectRepository(ReconCheckSessionEntity)
    private readonly sessionRepo: Repository<ReconCheckSessionEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig() {
    return RECON_CHECK_CONFIG;
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

    const difficultyId = input.difficultyId || RECON_CHECK_CONFIG.defaultDifficultyId;
    const difficulty = RECON_CHECK_CONFIG.difficulties.find((item) => item.difficultyId === difficultyId);
    if (!difficulty) codedBad(ErrorCodes.RECON_INVALID_CONFIG, '对账校验配置不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    const entryFee = RECON_CHECK_CONFIG.entryFee;
    if (user.coins < entryFee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法开始本局');
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + difficulty.timeLimitSec * 1000);
    const rounds = generateReconRounds({
      rows: difficulty.rows,
      cols: difficulty.cols,
      rounds: difficulty.rounds,
      diffsPerRound: difficulty.diffsPerRound,
      seed: Date.now() ^ Math.floor(Math.random() * 0xffffffff),
    });

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
        rounds: difficulty.rounds,
        diffsPerRound: difficulty.diffsPerRound,
        timeLimitSec: difficulty.timeLimitSec,
        entryFee,
        rewardCoins: difficulty.rewardCoins,
        maxWrongClicks: RECON_CHECK_CONFIG.maxWrongClicks,
        extendCount: 0,
        maxExtends: RECON_CHECK_CONFIG.maxExtends,
        roundsJson: JSON.stringify(rounds),
        startedAt: now,
        deadlineAt,
        finishedAt: null,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'recon-check-entry');
    return { session: this.toSession(entity), wallet, _v: 1 as const };
  }

  async extendSession(userId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({
        ok: false,
        code: ErrorCodes.RECON_SESSION_NOT_FOUND,
        message: '本局已失效',
        _v: 1,
      });
    }
    if (entity.status !== 'playing') {
      codedBad(ErrorCodes.RECON_SESSION_SETTLED, '本局已结束，无法延长');
    }
    if (Date.now() > entity.deadlineAt.getTime()) {
      codedBad(ErrorCodes.RECON_SESSION_EXPIRED, '已超时，无法延长');
    }
    if (entity.extendCount >= entity.maxExtends) {
      codedBad(ErrorCodes.RECON_EXTEND_LIMIT, `本局延长次数已用完（最多 ${entity.maxExtends} 次）`);
    }

    const fee = RECON_CHECK_CONFIG.extendFee;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    if (user.coins < fee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法使用延长器');
    }

    user.coins -= fee;
    entity.extendCount += 1;
    entity.deadlineAt = new Date(entity.deadlineAt.getTime() + RECON_CHECK_CONFIG.extendSec * 1000);
    await this.userRepo.save(user);
    await this.sessionRepo.save(entity);

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'recon-check-extend');
    return {
      session: this.toSession(entity),
      wallet,
      extendFee: fee,
      extendSec: RECON_CHECK_CONFIG.extendSec,
      _v: 1 as const,
    };
  }

  async finishSession(userId: string, sessionId: string, input: ReconCheckFinishInput) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({
        ok: false,
        code: ErrorCodes.RECON_SESSION_NOT_FOUND,
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
    const wrongClicks = typeof input.wrongClicks === 'number' ? input.wrongClicks : 0;
    const foundByRound = Array.isArray(input.foundByRound) ? input.foundByRound : [];
    const rounds = this.parseRounds(entity.roundsJson);

    let isWin = false;
    if (input.result === 'won') {
      if (now.getTime() > entity.deadlineAt.getTime() + 2000) {
        entity.status = 'expired';
        entity.finishedAt = now;
        await this.sessionRepo.save(entity);
        codedBad(ErrorCodes.RECON_SESSION_EXPIRED, '已超时，核对失败');
      }
      if (wrongClicks > entity.maxWrongClicks) {
        codedBad(ErrorCodes.RECON_INVALID_RESULT, '失误次数超限，无法通关');
      }
      if (foundByRound.length !== rounds.length) {
        codedBad(ErrorCodes.RECON_INVALID_RESULT, '轮次结果不完整');
      }
      const allMatch = rounds.every((round, index) =>
        setsEqual(foundByRound[index] ?? [], round.diffKeys),
      );
      if (!allMatch) {
        codedBad(ErrorCodes.RECON_INVALID_RESULT, '差异核对未全部正确');
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
    if (rewardCoins > 0) this.emitWallet(userId, wallet, 'recon-check-reward');
    return {
      sessionId: entity.id,
      status: entity.status,
      rewardCoins,
      wallet,
      alreadySettled: false,
      _v: 1 as const,
    };
  }

  private parseRounds(json: string): ReconCheckRoundInternal[] {
    try {
      const parsed = JSON.parse(json) as ReconCheckRoundInternal[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private toSession(entity: ReconCheckSessionEntity): ReconCheckSession {
    const rounds = this.parseRounds(entity.roundsJson);
    return {
      sessionId: entity.id,
      difficultyId: entity.difficultyId as ReconCheckSession['difficultyId'],
      status: entity.status,
      rows: entity.rows,
      cols: entity.cols,
      rounds: entity.rounds,
      diffsPerRound: entity.diffsPerRound,
      timeLimitSec: entity.timeLimitSec,
      entryFee: entity.entryFee,
      rewardCoins: entity.rewardCoins,
      maxWrongClicks: entity.maxWrongClicks,
      startedAt: entity.startedAt.getTime(),
      deadlineAt: entity.deadlineAt.getTime(),
      finishedAt: entity.finishedAt?.getTime(),
      extendCount: entity.extendCount ?? 0,
      maxExtends: entity.maxExtends ?? RECON_CHECK_CONFIG.maxExtends,
      boards: toPublicBoards(rounds),
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
