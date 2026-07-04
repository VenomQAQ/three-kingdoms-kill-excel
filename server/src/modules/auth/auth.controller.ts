import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '../../common/error-codes';
import { env } from '../../config/env';
import { AuthService } from './auth.service';
import {
  AuthGuard,
  AuthedRequest,
  readRefreshCookie,
} from './auth.guard';

interface RegisterDto {
  email: string;
  password: string;
  confirmPassword?: string;
  nickname: string;
}
interface LoginDto {
  email: string;
  password: string;
}
interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}
interface UpdateProfileDto {
  nickname?: string;
}

function publicUser(user: {
  id?: string;
  userId?: string;
  email: string;
  nickname: string;
  preferredVersion: string;
  coins?: number;
  experience?: number;
  level?: number;
}) {
  return {
    userId: user.userId ?? user.id,
    email: user.email,
    nickname: user.nickname,
    preferredVersion: user.preferredVersion,
    coins: user.coins ?? 100,
    experience: user.experience ?? 0,
    level: user.level ?? 1,
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pair = await this.authService.register(body);
    this.setAuthCookies(res, pair.accessToken, pair.accessExpiresIn, pair.refreshToken, pair.refreshExpiresAt);
    return {
      ok: true,
      data: publicUser(pair),
      _v: 1,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = getIp(req);
    const pair = await this.authService.login({ email: body.email, password: body.password, ip });
    this.setAuthCookies(res, pair.accessToken, pair.accessExpiresIn, pair.refreshToken, pair.refreshExpiresAt);
    return {
      ok: true,
      data: publicUser(pair),
      _v: 1,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refresh = readRefreshCookie(req);
    await this.authService.logout(refresh ?? undefined);
    this.clearAuthCookies(res);
    return { ok: true, _v: 1 };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: ChangePasswordDto,
  ) {
    await this.authService.changePassword(req.user!.userId, body.oldPassword, body.newPassword);
    this.clearAuthCookies(res);
    return { ok: true, _v: 1 };
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async updateProfile(
    @Req() req: AuthedRequest,
    @Body() body: UpdateProfileDto,
  ) {
    const user = await this.authService.updateProfile(req.user!.userId, body);
    return {
      ok: true,
      data: publicUser(user),
      _v: 1,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = readRefreshCookie(req);
    if (!raw) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.REFRESH_EXPIRED, message: '缺少 refresh token', _v: 1 });
    }
    const result = await this.authService.refresh(raw);
    if (!result.ok) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException({ ok: false, code: result.code, message: '登录已失效', _v: 1 });
    }
    this.setAuthCookies(res, result.access, result.accessExpiresIn, result.refresh.token, result.refresh.expiresAt);
    return { ok: true, data: { expiresIn: result.accessExpiresIn }, _v: 1 };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest) {
    const user = await this.authService.findById(req.user!.userId);
    if (!user) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '账号不存在', _v: 1 });
    }
    return {
      ok: true,
      data: publicUser(user),
      _v: 1,
    };
  }

  // ---- helpers ----

  private setAuthCookies(
    res: Response,
    accessToken: string,
    accessExpiresInSec: number,
    refreshToken: string,
    refreshExpiresAt: Date,
  ) {
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: env.cookieSecure,
    };
    res.cookie('tk_at', accessToken, {
      ...common,
      path: '/',
      maxAge: accessExpiresInSec * 1000,
    });
    res.cookie('tk_rt', refreshToken, {
      ...common,
      path: '/api/auth/refresh',
      expires: refreshExpiresAt,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('tk_at', { path: '/' });
    res.clearCookie('tk_rt', { path: '/api/auth/refresh' });
  }
}

function getIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
