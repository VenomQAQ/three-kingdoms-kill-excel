import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { TypingMazeSessionEntity } from './entities/typing-maze-session.entity';
import { TypingMazeController } from './typing-maze.controller';
import { TypingMazeService } from './typing-maze.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([TypingMazeSessionEntity, User])],
  controllers: [TypingMazeController],
  providers: [TypingMazeService],
})
export class TypingMazeModule {}
