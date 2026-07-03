import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { DebugController } from './debug.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken])],
  controllers: [DebugController],
})
export class DebugModule {}
