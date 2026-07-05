import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { ErrorCodes } from '../../common/error-codes';
import { User } from './entities/user.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { SocketAuthService } from './socket-auth.service';
import type { PlayerPublicProfile } from '@tk/shared';

const QQ_EMAIL_RE = /^\d{5,11}@qq\.com$/i;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9!@#$%^&*_.-]{8,32}$/;
const NICKNAME_UPDATE_INTERVAL_MS = 60_000;
const DAILY_CHECK_IN_COINS = 50;
const DAILY_CHECK_IN_EXPERIENCE = 10;

function throwCode(exception: 'bad' | 'conflict' | 'unauth', code: string, message: string): never {
  if (exception === 'bad') throw new BadRequestException({ ok: false, code, message, _v: 1 });
  if (exception === 'conflict') throw new ConflictException({ ok: false, code, message, _v: 1 });
  throw new UnauthorizedException({ ok: false, code, message, _v: 1 });
}

export interface RegisterInput {
  email: string;
  password: string;
  confirmPassword?: string;
  nickname: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
}

export interface UpdateProfileInput {
  nickname?: string;
}

export interface AuthPair {
  userId: string;
  email: string;
  nickname: string;
  preferredVersion: string;
  coins: number;
  experience: number;
  level: number;
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface CheckInResult {
  coins: number;
  experience: number;
  level: number;
  reward: {
    coins: number;
    experience: number;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly nicknameUpdatedAt = new Map<string, number>();

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly pwd: PasswordService,
    private readonly tokens: TokenService,
    private readonly limiter: LoginRateLimiter,
    private readonly socketAuth: SocketAuthService,
  ) {}

  // ---- Register ----

  async register(input: RegisterInput): Promise<AuthPair> {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const nickname = typeof input?.nickname === 'string' ? input.nickname.trim() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const confirmPassword = typeof input?.confirmPassword === 'string' ? input.confirmPassword : password;

    if (!QQ_EMAIL_RE.test(email)) {
      throwCode('bad', ErrorCodes.INVALID_EMAIL, '邮箱必须为 QQ 邮箱（数字@qq.com）');
    }
    if (!PASSWORD_RE.test(password)) {
      throwCode('bad', ErrorCodes.WEAK_PASSWORD, '密码需 8-32 位，且同时包含字母和数字');
    }
    if (password !== confirmPassword) {
      throwCode('bad', ErrorCodes.PASSWORD_MISMATCH, '两次密码不一致');
    }
    this.assertNickname(nickname);

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throwCode('conflict', ErrorCodes.USER_EXISTS, '该邮箱已注册');
    }

    const passwordHash = await this.pwd.hash(password);
    const user = await this.userRepo.save(
      this.userRepo.create({
        id: ulid(),
        email,
        passwordHash,
        nickname,
      preferredVersion: 'standard-2014',
      coins: 100,
      experience: 0,
      level: 1,
      lastLoginAt: new Date(),
      }),
    );
    this.logger.log(`register user=${user.id} email=${email}`);
    return this.issuePair(user);
  }

  // ---- Login ----

  async login(input: LoginInput): Promise<AuthPair> {
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const ip = input?.ip ?? 'unknown';
    if (!email || !password) {
      throwCode('unauth', ErrorCodes.BAD_CREDENTIALS, '邮箱或密码错误');
    }
    if (this.limiter.isBlocked(ip, email)) {
      throwCode('unauth', ErrorCodes.LOGIN_RATE_LIMIT, '登录尝试过于频繁，请稍后再试');
    }

    const user = await this.userRepo.findOne({ where: { email } });
    const ok = user ? await this.pwd.verify(user.passwordHash, password) : false;
    if (!user || !ok) {
      this.limiter.recordFailure(ip, email);
      throwCode('unauth', ErrorCodes.BAD_CREDENTIALS, '邮箱或密码错误');
    }

    this.limiter.recordSuccess(ip, email);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);
    this.logger.log(`login user=${user.id}`);
    return this.issuePair(user);
  }

  // ---- Logout ----

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await this.tokens.revokeByToken(refreshToken, 'logout');
  }

  // ---- Change Password ----

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const oldPwd = typeof oldPassword === 'string' ? oldPassword : '';
    const newPwd = typeof newPassword === 'string' ? newPassword : '';
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throwCode('unauth', ErrorCodes.UNAUTHORIZED, '会话已失效');
    const ok = await this.pwd.verify(user!.passwordHash, oldPwd);
    if (!ok) throwCode('bad', ErrorCodes.PASSWORD_MISMATCH, '原密码错误');
    if (!PASSWORD_RE.test(newPwd)) {
      throwCode('bad', ErrorCodes.WEAK_PASSWORD, '密码需 8-32 位，且同时包含字母和数字');
    }
    user!.passwordHash = await this.pwd.hash(newPwd);
    await this.userRepo.save(user!);
    await this.tokens.revokeAllByUser(userId, 'password-changed');

    // 广播 auth:invalidated 并强断所有该账号的 socket
    this.socketAuth.emitToUser(userId, 'auth:invalidated', {
      reason: 'password-changed',
      _v: 1,
    });
    this.socketAuth.disconnectByUser(userId);

    this.logger.log(`change-password user=${userId}, all refresh revoked`);
  }

  // ---- Profile ----

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throwCode('unauth', ErrorCodes.UNAUTHORIZED, '会话已失效');

    if (typeof input.nickname === 'string') {
      const nickname = input.nickname.trim();
      this.assertNickname(nickname);
      const lastUpdatedAt = this.nicknameUpdatedAt.get(userId) ?? 0;
      if (Date.now() - lastUpdatedAt < NICKNAME_UPDATE_INTERVAL_MS) {
        throwCode('bad', ErrorCodes.NICKNAME_RATE_LIMIT, '昵称修改过于频繁，请稍后再试');
      }
      user.nickname = nickname;
    }

    await this.userRepo.save(user);
    this.nicknameUpdatedAt.set(userId, Date.now());
    this.socketAuth.updateUserNickname(userId, user.nickname);
    this.socketAuth.emitToUser(userId, 'user:nicknameChanged', {
      userId,
      nickname: user.nickname,
      _v: 1,
    });
    return user;
  }

  // ---- Daily check-in ----

  async checkIn(userId: string): Promise<CheckInResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throwCode('unauth', ErrorCodes.UNAUTHORIZED, 'Session expired');

    if (isSameLocalDate(user.lastCheckInAt, new Date())) {
      throwCode('bad', ErrorCodes.CHECK_IN_ALREADY_DONE, 'Already checked in today');
    }

    user.coins += DAILY_CHECK_IN_COINS;
    user.experience += DAILY_CHECK_IN_EXPERIENCE;
    user.lastCheckInAt = new Date();
    await this.userRepo.save(user);

    const wallet = {
      coins: user.coins,
      experience: user.experience,
      level: user.level,
    };
    this.socketAuth.emitToUser(userId, 'user:walletChanged', {
      ...wallet,
      _v: 1,
    });

    return {
      ...wallet,
      reward: {
        coins: DAILY_CHECK_IN_COINS,
        experience: DAILY_CHECK_IN_EXPERIENCE,
      },
    };
  }

  // ---- Refresh ----

  async refresh(rawRefresh: string) {
    return this.tokens.rotate(rawRefresh);
  }

  // ---- Me ----

  async findById(userId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  async getPublicProfile(userId: string): Promise<PlayerPublicProfile | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;
    return {
      userId: user.id,
      nickname: user.nickname,
      level: user.level,
      coins: user.coins,
      stats: {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      },
      updatedAt: user.updatedAt?.getTime?.() ?? Date.now(),
      _v: 1,
    };
  }

  // ---- helpers ----

  private async issuePair(user: User): Promise<AuthPair> {
    const { token: accessToken, expiresInSec: accessExpiresIn } = this.tokens.signAccess(user.id);
    const rt = await this.tokens.issueRefresh(user.id);
    return {
      userId: user.id,
      email: user.email,
      nickname: user.nickname,
      preferredVersion: user.preferredVersion,
      coins: user.coins,
      experience: user.experience,
      level: user.level,
      accessToken,
      accessExpiresIn,
      refreshToken: rt.token,
      refreshExpiresAt: rt.expiresAt,
    };
  }

  private assertNickname(nickname: string): void {
    if (nickname.length < 2 || nickname.length > 12 || /[<>]/.test(nickname)) {
      throwCode('bad', ErrorCodes.INVALID_NICKNAME, '昵称长度需 2-12 字符，且不可包含 <>');
    }
  }
}

function isSameLocalDate(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
