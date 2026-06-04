import { Injectable } from '@nestjs/common';
import { GameEngine, SangokushiEngine } from '@tk/engine';
import type { Room, RoomPlayer } from '@tk/shared';

export type SandboxEngine = SangokushiEngine;

@Injectable()
export class GameService {
  private readonly engines = new Map<string, GameEngine>();
  private readonly sandboxEngines = new Map<string, SangokushiEngine>();

  getEngine(roomId: string): GameEngine | undefined {
    return this.engines.get(roomId);
  }

  getSandboxEngine(roomId: string): SangokushiEngine | undefined {
    return this.sandboxEngines.get(roomId);
  }

  createEngine(room: Room): GameEngine {
    const engine = new GameEngine(this.mapRoomPlayers(room.players));
    this.engines.set(room.id, engine);
    return engine;
  }

  createSandboxEngine(room: Room): SangokushiEngine {
    const engine = new SangokushiEngine({ roomPlayers: this.mapRoomPlayers(room.players) });
    this.sandboxEngines.set(room.id, engine);
    return engine;
  }

  destroyEngine(roomId: string): void {
    this.engines.delete(roomId);
    this.sandboxEngines.delete(roomId);
  }

  remapSandboxPlayerId(roomId: string, oldId: string, newId: string): void {
    const engine = this.sandboxEngines.get(roomId);
    engine?.remapPlayerId(oldId, newId);
  }

  syncRoomFromEngine(room: Room, engine: GameEngine | SangokushiEngine): void {
    const snap = engine.getSnapshot();
    if (!room.sandbox) return;

    room.sandbox.turnIndex = snap.turnIndex;
    room.sandbox.round = snap.round;
    room.sandbox.turnPhase = snap.turnPhase;
    room.sandbox.log = snap.log.slice(0, 40);
    room.sandbox.prompt = snap.prompt;

    const byId = new Map(snap.players.map((p) => [p.id, p]));
    for (const rp of room.players) {
      const ep = byId.get(rp.id);
      if (!ep) continue;
      rp.hp = ep.hp;
      rp.maxHp = ep.maxHp;
      rp.handCards = ep.handCards;
      rp.equipment = ep.equipment;
      rp.judgeCards = ep.judgeCards;
      rp.general = ep.generalName;
    }
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
