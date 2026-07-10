import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LianliankanSession, LianliankanTile } from '@tk/shared';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { SocketAuthService } from '../auth/socket-auth.service';
import { User } from '../auth/entities/user.entity';
import { LianliankanSessionEntity } from './entities/lianliankan-session.entity';
import { LIANLIANKAN_CONFIG } from './lianliankan.config';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

function codedBad(code: string, message: string): never {
  throw new BadRequestException({ ok: false, code, message, _v: 1 });
}

@Injectable()
export class LianliankanService {
  constructor(
    @InjectRepository(LianliankanSessionEntity)
    private readonly sessionRepo: Repository<LianliankanSessionEntity>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly socketAuth: SocketAuthService,
  ) {}

  getConfig() {
    return LIANLIANKAN_CONFIG;
  }

  async createSession(userId: string, input: { themeId?: string; difficultyId?: string; mode?: 'solo' | 'race' }) {
    const existingPlaying = await this.sessionRepo.findOne({ where: { userId, status: 'playing' } });
    if (existingPlaying) {
      // 超时未结算的局会卡住「开始」：先标记过期，再允许开新局
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

    const themeId = input.themeId || LIANLIANKAN_CONFIG.defaultThemeId;
    const difficultyId = input.difficultyId || LIANLIANKAN_CONFIG.defaultDifficultyId;
    const theme = LIANLIANKAN_CONFIG.themes.find((item) => item.themeId === themeId);
    const difficulty = LIANLIANKAN_CONFIG.difficulties.find((item) => item.difficultyId === difficultyId);
    if (!theme || !difficulty) codedBad(ErrorCodes.LLK_INVALID_CONFIG, '连连看配置不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    if (user.coins < difficulty.entryFee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法开始本局');
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + difficulty.timeLimitSec * 1000);
    const board = this.buildBoard(theme.items.map((item) => item.id), difficulty.rows, difficulty.cols, difficulty.kindCount);
    user.coins -= difficulty.entryFee;
    await this.userRepo.save(user);

    const entity = await this.sessionRepo.save(
      this.sessionRepo.create({
        id: ulid(),
        userId,
        mode: input.mode === 'race' ? 'race' : 'solo',
        roomId: null,
        themeId: theme.themeId,
        difficultyId: difficulty.difficultyId,
        status: 'playing',
        rows: difficulty.rows,
        cols: difficulty.cols,
        timeLimitSec: difficulty.timeLimitSec,
        entryFee: difficulty.entryFee,
        rewardCoins: difficulty.rewardCoins,
        boardJson: JSON.stringify(board),
        refreshUsed: false,
        startedAt: now,
        deadlineAt,
        finishedAt: null,
      }),
    );

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'lianliankan-entry');
    return { session: this.toSession(entity), wallet, _v: 1 as const };
  }

  async finishSession(userId: string, sessionId: string, input: { result?: 'won' | 'lost'; remainingTiles?: number }) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({ ok: false, code: ErrorCodes.LLK_SESSION_NOT_FOUND, message: '本局已失效', _v: 1 });
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
    const isWin = input.result === 'won' && input.remainingTiles === 0;
    if (isWin && now.getTime() > entity.deadlineAt.getTime()) {
      entity.status = 'expired';
      entity.finishedAt = now;
      await this.sessionRepo.save(entity);
      codedBad(ErrorCodes.LLK_SESSION_EXPIRED, '已超时，挑战失败');
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
    if (rewardCoins > 0) this.emitWallet(userId, wallet, 'lianliankan-reward');
    return {
      sessionId: entity.id,
      status: entity.status,
      rewardCoins,
      wallet,
      alreadySettled: false,
      _v: 1 as const,
    };
  }

  /**
   * 局内刷新：对客户端上报的剩余格子重排位置，扣 refreshFee，一局仅一次。
   */
  async refreshSession(userId: string, sessionId: string, remainingTiles: LianliankanTile[]) {
    const entity = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!entity) {
      throw new NotFoundException({ ok: false, code: ErrorCodes.LLK_SESSION_NOT_FOUND, message: '本局已失效', _v: 1 });
    }
    if (entity.status !== 'playing') {
      codedBad(ErrorCodes.LLK_SESSION_SETTLED, '本局已结束，无法刷新');
    }
    if (Date.now() > entity.deadlineAt.getTime()) {
      codedBad(ErrorCodes.LLK_SESSION_EXPIRED, '已超时，无法刷新');
    }
    if (entity.refreshUsed) {
      codedBad(ErrorCodes.LLK_REFRESH_USED, '本局已刷新过一次');
    }

    const fee = LIANLIANKAN_CONFIG.refreshFee;
    const stored = JSON.parse(entity.boardJson) as LianliankanTile[];
    this.assertRefreshBoard(stored, remainingTiles, entity.rows, entity.cols);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '会话已失效', _v: 1 });
    }
    if (user.coins < fee) {
      codedBad(ErrorCodes.WALLET_INSUFFICIENT_COINS, '金币不足，无法刷新');
    }

    const reshuffled = this.reshuffleRemaining(remainingTiles, entity.rows, entity.cols);
    user.coins -= fee;
    entity.boardJson = JSON.stringify(reshuffled);
    entity.refreshUsed = true;
    await this.userRepo.save(user);
    await this.sessionRepo.save(entity);

    const wallet = this.toWallet(user);
    this.emitWallet(userId, wallet, 'lianliankan-refresh');
    return {
      session: this.toSession(entity),
      wallet,
      refreshFee: fee,
      _v: 1 as const,
    };
  }

  private assertRefreshBoard(
    stored: LianliankanTile[],
    remaining: LianliankanTile[],
    rows: number,
    cols: number,
  ): void {
    if (!Array.isArray(remaining) || remaining.length === 0 || remaining.length % 2 !== 0) {
      codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
    }
    if (remaining.length > stored.length) {
      codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
    }

    const countByItem = (tiles: LianliankanTile[]) => {
      const map = new Map<string, number>();
      for (const tile of tiles) {
        map.set(tile.itemId, (map.get(tile.itemId) ?? 0) + 1);
      }
      return map;
    };
    const remainingCounts = countByItem(remaining);
    const storedCounts = countByItem(stored);
    for (const [itemId, count] of remainingCounts) {
      if ((storedCounts.get(itemId) ?? 0) < count || count % 2 !== 0) {
        codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
      }
    }

    const seenIds = new Set<string>();
    const seenCells = new Set<string>();
    for (const tile of remaining) {
      if (!tile?.tileId || !tile.itemId || typeof tile.row !== 'number' || typeof tile.col !== 'number') {
        codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
      }
      if (tile.row < 0 || tile.row >= rows || tile.col < 0 || tile.col >= cols) {
        codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
      }
      if (seenIds.has(tile.tileId) || seenCells.has(`${tile.row},${tile.col}`)) {
        codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
      }
      seenIds.add(tile.tileId);
      seenCells.add(`${tile.row},${tile.col}`);
    }
  }

  /** 保留剩余图案，打乱后重新铺到网格前 N 个位置（紧凑重排，便于继续连） */
  private reshuffleRemaining(tiles: LianliankanTile[], rows: number, cols: number): LianliankanTile[] {
    const itemIds = tiles.map((tile) => tile.itemId);
    for (let i = itemIds.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [itemIds[i], itemIds[j]] = [itemIds[j]!, itemIds[i]!];
    }
    const capacity = rows * cols;
    if (itemIds.length > capacity) {
      codedBad(ErrorCodes.LLK_REFRESH_INVALID_BOARD, '剩余棋盘无效');
    }
    return itemIds.map((itemId, index) => ({
      tileId: ulid(),
      itemId,
      row: Math.floor(index / cols),
      col: index % cols,
    }));
  }

  private buildBoard(itemIds: string[], rows: number, cols: number, kindCount: number): LianliankanTile[] {
    const total = rows * cols;
    const pairCount = total / 2;
    const selected = itemIds.slice(0, Math.max(1, Math.min(kindCount, itemIds.length)));
    const ids: string[] = [];
    for (let pair = 0; pair < pairCount; pair += 1) {
      const itemId = selected[pair % selected.length]!;
      ids.push(itemId, itemId);
    }
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return ids.map((itemId, index) => ({
      tileId: ulid(),
      itemId,
      row: Math.floor(index / cols),
      col: index % cols,
    }));
  }

  private toSession(entity: LianliankanSessionEntity): LianliankanSession {
    return {
      sessionId: entity.id,
      mode: entity.mode,
      roomId: entity.roomId ?? undefined,
      themeId: entity.themeId,
      difficultyId: entity.difficultyId as LianliankanSession['difficultyId'],
      status: entity.status,
      rows: entity.rows,
      cols: entity.cols,
      timeLimitSec: entity.timeLimitSec,
      entryFee: entity.entryFee,
      rewardCoins: entity.rewardCoins,
      startedAt: entity.startedAt.getTime(),
      deadlineAt: entity.deadlineAt.getTime(),
      finishedAt: entity.finishedAt?.getTime(),
      refreshUsed: Boolean(entity.refreshUsed),
      board: JSON.parse(entity.boardJson) as LianliankanTile[],
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
