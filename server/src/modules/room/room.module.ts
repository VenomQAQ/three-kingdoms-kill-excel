import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';

@Module({
  imports: [GameModule],
  providers: [RoomService],
  controllers: [RoomController],
  exports: [RoomService],
})
export class RoomModule {}
