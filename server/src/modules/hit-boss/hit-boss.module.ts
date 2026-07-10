import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { HitBossSessionEntity } from './entities/hit-boss-session.entity';
import { HitBossController } from './hit-boss.controller';
import { HitBossService } from './hit-boss.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([HitBossSessionEntity, User])],
  controllers: [HitBossController],
  providers: [HitBossService],
})
export class HitBossModule {}
