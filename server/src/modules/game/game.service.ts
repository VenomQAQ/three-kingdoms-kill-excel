import { Injectable } from '@nestjs/common';
import { GameEngine, SangokushiEngine } from '@tk/engine';
import type { Room, RoomPlayer } from '@tk/shared';

export type RoomEngine = SangokushiEngine;

@Injectable()
export class GameService {
  private readonly legacyEngines = new Map<string, GameEngine>();
  private readonly roomEngines = new Map<string, SangokushiEngine>();

  getEngine(roomId: string): GameEngine | undefined {
    return this.legacyEngines.get(roomId);
  }

  getRoomEngine(roomId: string): SangokushiEngine | undefined {
    return this.roomEngines.get(roomId);
  }

  /** @deprecated 使用 getRoomEngine */
  getSandboxEngine(roomId: string): SangokushiEngine | undefined {
    return this.getRoomEngine(roomId);
  }

  createEngine(room: Room): GameEngine {
    const engine = new GameEngine(this.mapRoomPlayers(room.players));
    this.legacyEngines.set(room.id, engine);
    return engine;
  }

  createRoomEngine(room: Room): SangokushiEngine {
    const engine = new SangokushiEngine({ roomPlayers: this.mapRoomPlayers(room.players) });
    this.roomEngines.set(room.id, engine);
    return engine;
  }

  /** @deprecated 使用 createRoomEngine */
  createSandboxEngine(room: Room): SangokushiEngine {
    return this.createRoomEngine(room);
  }

  destroyEngine(roomId: string): void {
    this.legacyEngines.delete(roomId);
    this.roomEngines.delete(roomId);
  }

  remapPlayerId(roomId: string, oldId: string, newId: string): void {
    const engine = this.roomEngines.get(roomId);
    engine?.remapPlayerId(oldId, newId);
  }

  /** @deprecated 使用 remapPlayerId */
  remapSandboxPlayerId(roomId: string, oldId: string, newId: string): void {
    this.remapPlayerId(roomId, oldId, newId);
  }

  syncRoomFromEngine(room: Room, engine: GameEngine | SangokushiEngine): void {
    const snap = engine.getSnapshot();
    if (!room.sandbox) {
      room.sandbox = {
        phase: 'playing',
        turnIndex: 0,
        round: 1,
        log: [],
        prompt: null,
      };
    }

    room.sandbox.turnIndex = snap.turnIndex;
    room.sandbox.round = snap.round;
    room.sandbox.turnPhase = snap.turnPhase;
    room.sandbox.log = snap.log.slice(0, 40);
    room.sandbox.prompt = snap.prompt;
    room.sandbox.victory = snap.victory ?? null;
    room.sandbox.phase = snap.victory ? 'finished' : 'playing';
    if (snap.victory) {
      room.status = 'finished';
    }

    const byId = new Map(snap.players.map((p) => [p.id, p]));
    for (const rp of room.players) {
      const ep = byId.get(rp.id);
      if (!ep) continue;
      rp.hp = ep.hp;
      rp.maxHp = ep.maxHp;
      rp.handCards = ep.handCards;
      rp.handCount = ep.handCards.length;
      rp.equipment = ep.equipment;
      rp.judgeCards = ep.judgeCards;
      rp.general = ep.generalName;
      rp.role = ep.role;
      rp.roleRevealed = ep.roleRevealed;
      rp.dead = ep.dead;
    }
  }

  /** 按玩家视角过滤房间状态（隐藏他人手牌与未公开身份） */
  filterRoomForPlayer(room: Room, viewerId: string): Room {
    const clone: Room = JSON.parse(JSON.stringify(room)) as Room;
    if (clone.sandbox?.prompt && clone.sandbox.prompt.playerId !== viewerId) {
      clone.sandbox.prompt = null;
    }
    for (const p of clone.players) {
      const isSelf = p.id === viewerId;
      const roleVisible = p.roleRevealed || p.role === '主公' || isSelf;
      if (!roleVisible) {
        p.role = '？';
      }
      if (!isSelf) {
        p.handCount = p.handCards?.length ?? 0;
        p.handCards = [];
      }
    }
    return clone;
  }

  actingForPrompt(room: Room, prompt: { playerId: string } | null | undefined): string | null {
    return prompt?.playerId ?? null;
  }

  private mapRoomPlayers(players: RoomPlayer[]) {
    return players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      general: p.general,
      role: p.role,
      hp: p.hp,
      maxHp: p.maxHp,
      handCards: p.handCards,
      equipment: p.equipment,
      judgeCards: p.judgeCards,
      seat: p.seat,
    }));
  }
}
