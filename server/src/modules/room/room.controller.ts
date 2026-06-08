import { Controller, Get, Param } from '@nestjs/common';
import { RoomService } from './room.service';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  listPublic() {
    return this.roomService.listPublicRooms();
  }

  @Get(':code')
  getByCode(@Param('code') code: string) {
    const room = this.roomService.getRoomByCode(code);
    if (!room) {
      return { exists: false };
    }
    return {
      exists: true,
      code: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
    };
  }
}
