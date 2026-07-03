import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ErrorCodes } from '../../common/error-codes';
import { TokenService } from './token.service';

/**
 * 附加到 req.user；用于路由 @UseGuards(AuthGuard) 保护
 */
export interface AuthedRequest extends Request {
  user?: { userId: string; jti: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readAccessCookie(req);
    if (!token) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '未登录', _v: 1 });
    }
    const payload = this.tokens.verifyAccess(token);
    if (!payload) {
      throw new UnauthorizedException({ ok: false, code: ErrorCodes.UNAUTHORIZED, message: '登录已过期', _v: 1 });
    }
    req.user = { userId: payload.sub, jti: payload.jti };
    return true;
  }
}

export function readAccessCookie(req: Request): string | null {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.tk_at ?? null;
}

export function readRefreshCookie(req: Request): string | null {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.tk_rt ?? null;
}
