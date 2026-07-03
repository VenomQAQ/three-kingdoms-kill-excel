import { Module, OnModuleInit } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { ReconnectService } from './reconnect.service';

@Module({
  imports: [GameModule],
  providers: [RoomService, ReconnectService],
  controllers: [RoomController],
  exports: [RoomService, ReconnectService],
})
export class RoomModule implements OnModuleInit {
  constructor(
    private readonly rooms: RoomService,
    private readonly reconnect: ReconnectService,
  ) {}

  onModuleInit() {
    // BE-8：把 evict 回调注入 ReconnectService，避免循环依赖
    this.reconnect.bindEvictor((userId) => {
      this.rooms.evictByUser(userId);
    });
  }
}
