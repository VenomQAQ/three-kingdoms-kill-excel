import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ErrorCodes } from '../../common/error-codes';
import { AuthService } from './auth.service';

@Controller('api/users')
export class UserProfileController {
  constructor(private readonly authService: AuthService) {}

  @Get(':userId/profile')
  async profile(@Param('userId') userId: string) {
    const profile = await this.authService.getPublicProfile(userId);
    if (!profile) {
      throw new NotFoundException({
        ok: false,
        code: ErrorCodes.USER_NOT_FOUND,
        message: '玩家不存在',
        _v: 1,
      });
    }
    return { ok: true, data: profile, _v: 1 };
  }
}
