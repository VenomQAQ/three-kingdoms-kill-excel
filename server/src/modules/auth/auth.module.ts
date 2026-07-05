import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { SocketAuthService } from './socket-auth.service';
import { UserProfileController } from './user-profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  providers: [
    PasswordService,
    TokenService,
    AuthService,
    AuthGuard,
    LoginRateLimiter,
    SocketAuthService,
  ],
  controllers: [AuthController, UserProfileController],
  exports: [
    TypeOrmModule,
    PasswordService,
    TokenService,
    AuthService,
    AuthGuard,
    SocketAuthService,
  ],
})
export class AuthModule {}
