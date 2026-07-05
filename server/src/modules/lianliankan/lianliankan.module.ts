import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { LianliankanSessionEntity } from './entities/lianliankan-session.entity';
import { LianliankanController } from './lianliankan.controller';
import { LianliankanService } from './lianliankan.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([LianliankanSessionEntity, User])],
  controllers: [LianliankanController],
  providers: [LianliankanService],
})
export class LianliankanModule {}
