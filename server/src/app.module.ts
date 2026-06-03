import { Module } from '@nestjs/common';
import { RoomModule } from './modules/room/room.module';
import { ChatModule } from './modules/chat/chat.module';
import { GameGateway } from './gateway/game.gateway';

@Module({
  imports: [RoomModule, ChatModule],
  providers: [GameGateway],
})
export class AppModule {}
