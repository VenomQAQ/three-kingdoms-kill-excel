import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LobbyChatMessage } from './entities/lobby-chat-message.entity';
import { LobbyChatService } from './lobby-chat.service';
import { ChatRateLimiter } from './rate-limiter';

@Module({
  imports: [TypeOrmModule.forFeature([LobbyChatMessage])],
  providers: [LobbyChatService, ChatRateLimiter],
  exports: [LobbyChatService],
})
export class LobbyChatModule {}
