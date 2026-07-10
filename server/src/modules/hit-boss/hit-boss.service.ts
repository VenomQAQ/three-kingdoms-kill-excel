import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { HitBossSession } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import { HitBossSessionEntity } from './entities/hit-boss-session.entity';
import { HIT_BOSS_CONFIG } from './hit-boss.config';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class HitBossService {
  constructor(
    @InjectRepository(HitBossSessionEntity)
    private readonly sessionRepo: Repository<HitBossSessionEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig() {
    return HIT_BOSS_CONFIG;
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

    const difficultyId = input.difficultyId || HIT_BOSS_CONFIG.defaultDifficultyId;
    const difficulty = HIT_BOSS_CONFIG.difficulties.find((item) => item.difficultyId === difficultyId);
    if (!difficulty) codedBad(ErrorCodes.HITBOSS_INVALID_CONFIG, '打老板配置不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    const entryFee = HIT_BOSS_CONFIG.entryFee;
    if (user.coins < entryFee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法开始本局');
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + difficulty.timeLimitSec * 1000);
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
        timeLimitSec: difficulty.timeLimitSec,
        bossTarget: difficulty.bossTarget,
        entryFee,
        rewardCoins: difficulty.rewardCoins,
        spawnIntervalMs: difficulty.spawnIntervalMs,
        bossWeight: difficulty.bossWeight,
        distractorWeight: difficulty.distractorWeight,
        workWeight: difficulty.workWeight,
        extendCount: 0,
        maxExtends: HIT_BOSS_CONFIG.maxExtends,
        startedAt: now,
        deadlineAt,
        finishedAt: null,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'hit-boss-entry');
    return { session: this.toSession(entity), wallet, _v: 1 as const };
  }

  async extendSession(userId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({ ok: false, code: ErrorCodes.HITBOSS_SESSION_NOT_FOUND, message: '本局已失效', _v: 1 });
    }
    if (entity.status !== 'playing') {
      codedBad(ErrorCodes.HITBOSS_SESSION_SETTLED, '本局已结束，无法延长');
    }
    if (Date.now() > entity.deadlineAt.getTime()) {
      codedBad(ErrorCodes.HITBOSS_SESSION_EXPIRED, '已超时，无法延长');
    }
    if (entity.extendCount >= entity.maxExtends) {
      codedBad(ErrorCodes.HITBOSS_EXTEND_LIMIT, `本局延长次数已用完（最多 ${entity.maxExtends} 次）`);
    }

    const fee = HIT_BOSS_CONFIG.extendFee;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    if (user.coins < fee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法使用延长器');
    }

    user.coins -= fee;
    entity.extendCount += 1;
    entity.deadlineAt = new Date(entity.deadlineAt.getTime() + HIT_BOSS_CONFIG.extendSec * 1000);
    await this.userRepo.save(user);
    await this.sessionRepo.save(entity);

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'hit-boss-extend');
    return {
      session: this.toSession(entity),
      wallet,
      extendFee: fee,
      extendSec: HIT_BOSS_CONFIG.extendSec,
      _v: 1 as const,
    };
  }

  async finishSession(
    userId: string,
    sessionId: string,
    input: { result?: 'won' | 'lost'; bossesHit?: number; missHits?: number },
  ) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({ ok: false, code: ErrorCodes.HITBOSS_SESSION_NOT_FOUND, message: '本局已失效', _v: 1 });
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
    const bossesHit = typeof input.bossesHit === 'number' ? input.bossesHit : 0;
    const isWin = input.result === 'won' && bossesHit >= entity.bossTarget;
    if (isWin && now.getTime() > entity.deadlineAt.getTime() + 2000) {
      entity.status = 'expired';
      entity.finishedAt = now;
      await this.sessionRepo.save(entity);
      codedBad(ErrorCodes.HITBOSS_SESSION_EXPIRED, '已超时，挑战失败');
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
    if (rewardCoins > 0) this.emitWallet(userId, wallet, 'hit-boss-reward');
    return {
      sessionId: entity.id,
      status: entity.status,
      rewardCoins,
      wallet,
      alreadySettled: false,
      _v: 1 as const,
    };
  }

  private toSession(entity: HitBossSessionEntity): HitBossSession {
    return {
      sessionId: entity.id,
      difficultyId: entity.difficultyId as HitBossSession['difficultyId'],
      status: entity.status,
      rows: entity.rows,
      cols: entity.cols,
      timeLimitSec: entity.timeLimitSec,
      bossTarget: entity.bossTarget,
      entryFee: entity.entryFee,
      rewardCoins: entity.rewardCoins,
      spawnIntervalMs: entity.spawnIntervalMs,
      bossWeight: entity.bossWeight,
      distractorWeight: entity.distractorWeight,
      workWeight: entity.workWeight,
      startedAt: entity.startedAt.getTime(),
      deadlineAt: entity.deadlineAt.getTime(),
      finishedAt: entity.finishedAt?.getTime(),
      extendCount: entity.extendCount,
      maxExtends: entity.maxExtends,
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
