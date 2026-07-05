import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { env } from './config/env';
import { RoomModule } from './modules/room/room.module';
import { GameModule } from './modules/game/game.module';
import { ChatModule } from './modules/chat/chat.module';
import { AuthModule } from './modules/auth/auth.module';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module';
import { LobbyChatModule } from './modules/lobby-chat/lobby-chat.module';
import { DebugModule } from './modules/debug/debug.module';
import { VersionModule } from './modules/version/version.module';
import { GameGateway } from './gateway/game.gateway';
import { User } from './modules/auth/entities/user.entity';

const sqlitePath = isAbsolute(env.sqlitePath)
  ? env.sqlitePath
  : resolve(process.cwd(), env.sqlitePath);
mkdirSync(dirname(sqlitePath), { recursive: true });

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: sqlitePath,
      autoLoadEntities: true,
      synchronize: true, // MVP：允许 TypeORM 自动建表；上线前切迁移
      logging: env.nodeEnv === 'development' ? ['error', 'warn', 'migration'] : ['error'],
    }),
    AuthModule,
    CapabilitiesModule,
    RoomModule,
    GameModule,
    ChatModule,
    LobbyChatModule,
    VersionModule,
    TypeOrmModule.forFeature([User]), // gateway 用（version:switch 需更新 preferredVersion）
    ...(env.debugClockEnabled ? [DebugModule] : []),
  ],
  providers: [GameGateway],
})
export class AppModule {}
