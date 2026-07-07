import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  assignIdentities,
  CharacterRegistry,
  SangokushiEngine,
} from '@tk/engine';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_VERSION_ID,
  findVersion,
  GameType,
  MonopolyBoardCell,
  MonopolyGameState,
  Room,
  RoomListItem,
  RoomLeaveReason,
  RoomPlayer,
  SANDBOX_ROOM_CODE,
  SandboxGameState,
} from '@tk/shared';
import { env } from '../../config/env';
import { recordGameResult } from '../auth/game-stats';
import { User } from '../auth/entities/user.entity';
import { GameService } from '../game/game.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const CODE_MIN = 10_000_000;
const CODE_MAX = 99_999_999;
const MAX_CODE_RETRIES = 10;
const LORD_GENERAL_OPTION_COUNT = 5;
const GENERAL_OPTION_COUNT = 3;
const MANUAL_LEAVE_PENALTY = 5;
const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
const MONOPOLY_MAX_PLAYERS = 4;
const MONOPOLY_START_CASH = 15000;
const MONOPOLY_PASS_START_BONUS = 200;

const MONOPOLY_WORLD_BOARD: MonopolyBoardCell[] = [
  { index: 0, name: '起点', country: '世界', type: 'start', price: 2000, displayPrice: 2000, rent: 0 },
  { index: 1, name: '苏州', country: '华东', type: 'city', price: 3200, displayPrice: 3200, rent: 420, rents: [420, 760, 1160], upgradeCosts: [1800, 2400], colorGroup: 'green', level: 1 },
  { index: 2, name: '财产税', country: '世界', type: 'tax', price: 0, displayPrice: 1000, rent: 1000 },
  { index: 3, name: '抚顺', country: '东北', type: 'city', price: 3500, displayPrice: 3500, rent: 460, rents: [460, 820, 1240], upgradeCosts: [1900, 2500], colorGroup: 'green', level: 1 },
  { index: 4, name: '命运', country: '世界', type: 'fate', price: 0, rent: 0 },
  { index: 5, name: '广州火车站', country: '交通', type: 'rail', price: 2000, displayPrice: 2000, rent: 320 },
  { index: 6, name: '陕西', country: '西北', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'gray', level: 1 },
  { index: 7, name: '机会', country: '世界', type: 'chance', price: 0, rent: 0 },
  { index: 8, name: '甘肃', country: '西北', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'gray', level: 1 },
  { index: 9, name: '澳门', country: '港澳', type: 'city', price: 2600, displayPrice: 2600, rent: 360, rents: [360, 640, 980], upgradeCosts: [1500, 2100], colorGroup: 'gray', level: 1 },
  { index: 10, name: '进牢', country: '世界', type: 'jail', price: 0, rent: 0 },
  { index: 11, name: '新疆', country: '西北', type: 'city', price: 4000, displayPrice: 4000, rent: 520, rents: [520, 920, 1400], upgradeCosts: [2200, 3000], colorGroup: 'blue', level: 1 },
  { index: 12, name: '自来水厂', country: '公用', type: 'utility', price: 500, displayPrice: 500, rent: 120 },
  { index: 13, name: '川西', country: '西南', type: 'city', price: 3200, displayPrice: 3200, rent: 420, rents: [420, 760, 1160], upgradeCosts: [1800, 2400], colorGroup: 'blue', level: 1 },
  { index: 14, name: '北湖', country: '西北', type: 'city', price: 3200, displayPrice: 3200, rent: 420, rents: [420, 760, 1160], upgradeCosts: [1800, 2400], colorGroup: 'blue', level: 1 },
  { index: 15, name: '沈阳火车站', country: '交通', type: 'rail', price: 2000, displayPrice: 2000, rent: 320 },
  { index: 16, name: '常州', country: '华东', type: 'city', price: 2800, displayPrice: 2800, rent: 360, rents: [360, 660, 1000], upgradeCosts: [1600, 2200], colorGroup: 'red', level: 1 },
  { index: 17, name: '机会', country: '世界', type: 'chance', price: 0, rent: 0 },
  { index: 18, name: '苏南', country: '华东', type: 'city', price: 2800, displayPrice: 2800, rent: 360, rents: [360, 660, 1000], upgradeCosts: [1600, 2200], colorGroup: 'red', level: 1 },
  { index: 19, name: '回牢', country: '世界', type: 'bonus', price: 0, rent: 0 },
  { index: 20, name: '济南', country: '华东', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'yellow', level: 1 },
  { index: 21, name: '桂林', country: '华南', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'yellow', level: 1 },
  { index: 22, name: '机会', country: '世界', type: 'chance', price: 0, rent: 0 },
  { index: 23, name: '哈尔滨', country: '东北', type: 'city', price: 2000, displayPrice: 2000, rent: 280, rents: [280, 520, 820], upgradeCosts: [1200, 1800], colorGroup: 'yellow', level: 1 },
  { index: 24, name: '吉林', country: '东北', type: 'city', price: 2000, displayPrice: 2000, rent: 280, rents: [280, 520, 820], upgradeCosts: [1200, 1800], colorGroup: 'yellow', level: 1 },
  { index: 25, name: '罚款停车站', country: '交通', type: 'rail', price: 2000, displayPrice: 2000, rent: 260 },
  { index: 26, name: '长春', country: '东北', type: 'city', price: 1000, displayPrice: 1000, rent: 180, rents: [180, 360, 620], upgradeCosts: [900, 1400], colorGroup: 'purple', level: 1 },
  { index: 27, name: '命运', country: '世界', type: 'fate', price: 0, rent: 0 },
  { index: 28, name: '庆阳', country: '西北', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'purple', level: 1 },
  { index: 29, name: '深圳', country: '华南', type: 'city', price: 2600, displayPrice: 2600, rent: 340, rents: [340, 620, 940], upgradeCosts: [1500, 2000], colorGroup: 'purple', level: 1 },
  { index: 30, name: '机场', country: '世界', type: 'bonus', price: 0, rent: 0 },
  { index: 31, name: '成都', country: '西南', type: 'city', price: 2600, displayPrice: 2600, rent: 360, rents: [360, 640, 980], upgradeCosts: [1500, 2100], colorGroup: 'red', level: 1 },
  { index: 32, name: '所得税', country: '世界', type: 'tax', price: 0, displayPrice: 2000, rent: 2000 },
  { index: 33, name: '郑州火车站', country: '交通', type: 'rail', price: 2000, displayPrice: 2000, rent: 320 },
  { index: 34, name: '北京', country: '华北', type: 'city', price: 3000, displayPrice: 3000, rent: 400, rents: [400, 720, 1120], upgradeCosts: [1700, 2300], colorGroup: 'pink', level: 1 },
  { index: 35, name: '机会', country: '世界', type: 'chance', price: 0, rent: 0 },
  { index: 36, name: '上海', country: '华东', type: 'city', price: 3000, displayPrice: 3000, rent: 400, rents: [400, 720, 1120], upgradeCosts: [1700, 2300], colorGroup: 'pink', level: 1 },
  { index: 37, name: '命运', country: '世界', type: 'fate', price: 0, rent: 0 },
  { index: 38, name: '苏州火车站', country: '交通', type: 'rail', price: 2000, displayPrice: 2000, rent: 320 },
  { index: 39, name: '入牢', country: '世界', type: 'jail', price: 0, rent: 0 },
];

function gameName(gameType?: GameType): string {
  return gameType === 'monopoly' ? '中国版大富翁' : '三国杀';
}

export interface LeaveRoomResult {
  room: Room | null;
  removed: boolean;
  disbanded: boolean;
  previousRoomId?: string;
  previousHostId?: string;
  newHostId?: string;
  penalty?: number;
}

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly roomsById = new Map<string, Room>();
  private readonly roomIdByCode = new Map<string, string>();
  private readonly playerRoom = new Map<string, string>();
  /** userId → playerId（当前活跃的 socket-scoped id） */
  private readonly userPlayer = new Map<string, string>();
  private readonly selectingTimers = new Map<string, NodeJS.Timeout>();
  private readonly generalOptionsByRoom = new Map<string, Map<string, string[]>>();
  private roomChanged: ((room: Room) => void) | null = null;

  constructor(
    private readonly gameService: GameService,
    @InjectRepository(User) private readonly userRepo?: Repository<User>,
  ) {}

  onModuleInit() {
    this.ensureSandboxRoom();
  }

  bindRoomChanged(callback: (room: Room) => void): void {
    this.roomChanged = callback;
  }

  /**
   * BE-8：断线保坐用。给 gateway/reconnect.service 调用的最小接口。
   */
  getRoomOfPlayer(playerId: string): Room | null {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return null;
    return this.roomsById.get(roomId) ?? null;
  }
  markPlayerDisconnected(playerId: string): Room | null {
    const room = this.getRoomOfPlayer(playerId);
    if (!room) return null;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = false;

    if (room.hostId === playerId) {
      this.syncLifecycle(room, {
        hostTransferPending: true,
        disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS,
      });
      const nextHostId = this.transferHost(room, playerId);
      if (!nextHostId) {
        this.deleteRoom(room);
        return null;
      }
    }

    this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
    return room;
  }
  bindUserPlayer(userId: string, playerId: string): void {
    this.userPlayer.set(userId, playerId);
  }
  unbindUserPlayer(userId: string): void {
    this.userPlayer.delete(userId);
  }
  getPlayerIdByUser(userId: string): string | null {
    return this.userPlayer.get(userId) ?? null;
  }

  updateNicknameByUser(userId: string, nickname: string): Room | null {
    const playerId = this.userPlayer.get(userId);
    if (!playerId) return null;
    const room = this.getRoomOfPlayer(playerId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return null;
    player.nickname = nickname;
    return room;
  }
  /**
   * 5min 到期或改密强制回收：将 userId 对应的座位真正 leaveRoom。
   */
  evictByUser(userId: string): LeaveRoomResult {
    const playerId = this.userPlayer.get(userId);
    if (!playerId) return { room: null, removed: false, disbanded: false };
    this.userPlayer.delete(userId);
    return this.leaveRoom(playerId, 'evict');
  }
  /**
   * 重连时把老 playerId 的座位迁移到新 playerId 上。
   * 若老 playerId 已不在房间（可能已被 evict），返回 null 让上层走"重新加入"。
   */
  rebindUserPlayer(userId: string, oldPlayerId: string, newPlayerId: string): Room | null {
    if (oldPlayerId === newPlayerId) {
      this.userPlayer.set(userId, newPlayerId);
      return this.roomsById.get(this.playerRoom.get(newPlayerId) ?? '') ?? null;
    }
    const roomId = this.playerRoom.get(oldPlayerId);
    if (!roomId) return null;
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === oldPlayerId);
    if (!player) return null;
    player.id = newPlayerId;
    player.userId = userId;
    player.connected = true;
    this.playerRoom.delete(oldPlayerId);
    this.playerRoom.set(newPlayerId, roomId);
    if (room.hostId === oldPlayerId) room.hostId = newPlayerId;
    this.userPlayer.set(userId, newPlayerId);
    // sandbox 引擎里的 playerId 也要迁移
    if (room.isSandbox && room.status === 'playing') {
      this.gameService.remapPlayerId(room.id, oldPlayerId, newPlayerId);
      const engine = this.gameService.getRoomEngine(room.id);
      if (engine) this.gameService.syncRoomFromEngine(room, engine);
    } else if (!room.isSandbox && room.status === 'playing') {
      this.gameService.remapPlayerId(room.id, oldPlayerId, newPlayerId);
      const engine = this.gameService.getRoomEngine(room.id);
      if (engine) this.gameService.syncRoomFromEngine(room, engine);
    } else if (!room.isSandbox && room.status === 'selecting') {
      this.remapSelectingPlayer(room, oldPlayerId, newPlayerId);
    }
    return room;
  }

  createRoom(
    hostId: string,
    nickname: string,
    versionId: string = DEFAULT_VERSION_ID,
    userId?: string | null,
    gameType: GameType = 'sanguosha',
  ): Room {
    this.assertSingleActiveRoom(hostId, userId);
    if (gameType === 'monopoly') {
      return this.createMonopolyRoom(hostId, nickname, userId);
    }
    const version = findVersion(versionId);
    if (!version) {
      throw new RoomError('E_VERSION_UNKNOWN', `未知版本 ${versionId}`);
    }
    const maxPlayers = version.maxPlayers;
    const code = this.generateUniqueCode();
    const room: Room = {
      id: uuidv4(),
      code,
      hostId,
      maxPlayers,
      versionId: version.id,
      versionName: version.name,
      players: [
        {
          id: hostId,
          userId: userId ?? undefined,
          nickname: nickname.trim() || '玩家',
          ready: false,
          connected: true,
        },
      ],
      status: 'waiting',
      settings: { maxPlayers },
      createdAt: Date.now(),
      gameType: 'sanguosha',
    };
    this.syncLifecycle(room);
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(code, room.id);
    this.playerRoom.set(hostId, room.id);
    this.actingPlayerBySocket.set(hostId, hostId);
    this.bindUserIdToPlayer(hostId, userId);
    return room;
  }

  joinRoom(code: string, playerId: string, nickname: string, userId?: string | null): Room {
    if (code === SANDBOX_ROOM_CODE) {
      return this.joinSandboxRoom(playerId, nickname, userId);
    }
    const room = this.getRoomByCode(code);
    if (!room) {
      throw new RoomError('E_ROOM_NOT_FOUND', '房间不存在');
    }
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname.trim() || existing.nickname;
      this.syncLifecycle(room);
      this.actingPlayerBySocket.set(playerId, playerId);
      return room;
    }
    if (userId) {
      const boundPlayerId = this.userPlayer.get(userId);
      if (boundPlayerId) {
        const boundRoomId = this.playerRoom.get(boundPlayerId);
        const rebound = room.players.find((p) => p.id === boundPlayerId && boundRoomId === room.id);
        if (rebound) {
          const oldPlayerId = rebound.id;
          rebound.id = playerId;
          rebound.userId = userId;
          rebound.connected = true;
          rebound.nickname = nickname.trim() || rebound.nickname;
          this.syncLifecycle(room);
          this.playerRoom.delete(oldPlayerId);
          this.playerRoom.set(playerId, room.id);
          this.userPlayer.set(userId, playerId);
          this.actingPlayerBySocket.set(playerId, playerId);
          if (room.hostId === oldPlayerId) room.hostId = playerId;
          this.remapSelectingPlayer(room, oldPlayerId, playerId);
          if (room.status === 'playing') {
            this.gameService.remapPlayerId(room.id, oldPlayerId, playerId);
            const engine = this.gameService.getRoomEngine(room.id);
            if (engine) this.gameService.syncRoomFromEngine(room, engine);
          }
          return room;
        }
      }
    }
    const rejoin = room.players.find(
      (p) => p.nickname === nickname.trim() && !p.connected,
    );
    if (rejoin) {
      const oldPlayerId = rejoin.id;
      rejoin.id = playerId;
      rejoin.userId = userId ?? rejoin.userId;
      rejoin.connected = true;
      this.syncLifecycle(room);
      this.playerRoom.delete(oldPlayerId);
      this.playerRoom.set(playerId, room.id);
      this.actingPlayerBySocket.set(playerId, playerId);
      if (room.hostId === oldPlayerId) room.hostId = playerId;
      this.remapSelectingPlayer(room, oldPlayerId, playerId);
      if (room.status === 'playing') {
        this.gameService.remapPlayerId(room.id, oldPlayerId, playerId);
        const engine = this.gameService.getRoomEngine(room.id);
        if (engine) this.gameService.syncRoomFromEngine(room, engine);
      }
      return room;
    }
    if (room.status !== 'waiting') {
      throw new RoomError('E_ROOM_STARTED', '对局已开始，无法加入');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('E_ROOM_FULL', '房间已满');
    }
    room.players.push({
      id: playerId,
      userId: userId ?? undefined,
      nickname: nickname.trim() || '玩家',
      ready: false,
      connected: true,
    });
    this.syncLifecycle(room);
    this.playerRoom.set(playerId, room.id);
    this.actingPlayerBySocket.set(playerId, playerId);
    this.bindUserIdToPlayer(playerId, userId);
    return room;
  }

  private createMonopolyRoom(hostId: string, nickname: string, userId?: string | null): Room {
    this.assertSingleActiveRoom(hostId, userId);
    const code = this.generateUniqueCode();
    const room: Room = {
      id: uuidv4(),
      code,
      hostId,
      maxPlayers: MONOPOLY_MAX_PLAYERS,
      versionId: 'monopoly-china',
      versionName: '中国版大富翁',
      gameType: 'monopoly',
      players: [
        {
          id: hostId,
          userId: userId ?? undefined,
          nickname: nickname.trim() || '玩家',
          ready: false,
          connected: true,
        },
      ],
      status: 'waiting',
      settings: { maxPlayers: MONOPOLY_MAX_PLAYERS },
      createdAt: Date.now(),
      monopoly: { phase: 'lobby', turnIndex: 0, round: 1, board: [], players: [], log: [] },
    };
    this.syncLifecycle(room);
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(code, room.id);
    this.playerRoom.set(hostId, room.id);
    this.actingPlayerBySocket.set(hostId, hostId);
    this.bindUserIdToPlayer(hostId, userId);
    return room;
  }

  leaveRoom(playerId: string, reason: RoomLeaveReason = 'manual'): LeaveRoomResult {
    this.actingPlayerBySocket.delete(playerId);
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return { room: null, removed: false, disbanded: false };
    const room = this.roomsById.get(roomId);
    if (!room) {
      this.playerRoom.delete(playerId);
      return { room: null, removed: false, disbanded: false };
    }
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return { room, removed: false, disbanded: false };

    const previousHostId = room.hostId;

    if (reason === 'disconnect') {
      room.players[idx].connected = false;
      let newHostId: string | undefined;
      if (room.hostId === playerId) {
        this.syncLifecycle(room, { hostTransferPending: true, disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
        newHostId = this.transferHost(room, playerId);
        if (!newHostId) {
          this.deleteRoom(room);
          return {
            room: null,
            removed: false,
            disbanded: true,
            previousRoomId: room.id,
            previousHostId,
          };
        }
      }
      this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
      return { room, removed: false, disbanded: false, previousRoomId: room.id, previousHostId, newHostId };
    }
    const leavingUserId = room.players[idx].userId;
    const shouldRemove =
      room.status === 'waiting' || reason === 'manual' || reason === 'evict' || reason === 'room-disband';

    if (!shouldRemove) {
      room.players[idx].connected = false;
      this.syncLifecycle(room, { disconnectGraceUntil: Date.now() + DISCONNECT_GRACE_MS });
      return { room, removed: false, disbanded: false, previousRoomId: room.id, previousHostId };
    }

    room.players.splice(idx, 1);
    this.playerRoom.delete(playerId);
    if (leavingUserId && this.userPlayer.get(leavingUserId) === playerId) {
      this.userPlayer.delete(leavingUserId);
    }
    this.clearSelectingPlayer(room, playerId);

    if (room.players.length === 0) {
      this.deleteRoom(room);
      return {
        room: null,
        removed: true,
        disbanded: true,
        previousRoomId: room.id,
        previousHostId,
      };
    }

    let newHostId: string | undefined;
    if (previousHostId === playerId) {
      this.syncLifecycle(room, { hostTransferPending: true });
      newHostId = this.transferHost(room, playerId);
      if (!newHostId) {
        this.deleteRoom(room);
        return {
          room: null,
          removed: true,
          disbanded: true,
          previousRoomId: room.id,
          previousHostId,
        };
      }
    }

    if (room.status === 'selecting') {
      this.rebuildGeneralSelectionAfterLeave(room);
    }
    this.syncLifecycle(room);

    return {
      room,
      removed: true,
      disbanded: false,
      previousRoomId: room.id,
      previousHostId,
      newHostId,
      penalty: reason === 'manual' && (room.status === 'selecting' || room.status === 'playing')
        ? MANUAL_LEAVE_PENALTY
        : 0,
    };
  }

  setReady(playerId: string, ready: boolean): Room {
    const room = this.getRoomByPlayerId(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('NOT_IN_ROOM', '不在房间内');
    player.ready = ready;
    this.syncLifecycle(room);
    return room;
  }

  switchRoomGame(playerId: string, gameType: GameType): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', '仅房主可切换游戏');
    if (room.isSandbox) throw new RoomError('SANDBOX_LOCKED', '模拟房不可切换游戏');
    if (room.status !== 'waiting') throw new RoomError('ALREADY_STARTED', '对局开始后不可切换游戏');

    room.gameType = gameType;
    room.players.forEach((player) => {
      player.ready = false;
      player.role = undefined;
      player.roleRevealed = undefined;
      player.general = undefined;
      player.handCards = [];
      player.handCount = 0;
      player.equipment = [];
      player.judgeCards = [];
      player.hp = undefined;
      player.maxHp = undefined;
      player.dead = false;
    });

    if (gameType === 'monopoly') {
      room.maxPlayers = MONOPOLY_MAX_PLAYERS;
      room.settings = { maxPlayers: MONOPOLY_MAX_PLAYERS };
      room.versionId = 'monopoly-china';
      room.versionName = '中国版大富翁';
      room.monopoly = { phase: 'lobby', turnIndex: 0, round: 1, board: [], players: [], log: [] };
      if (room.players.length > MONOPOLY_MAX_PLAYERS) {
        for (const player of room.players.splice(MONOPOLY_MAX_PLAYERS)) {
          this.playerRoom.delete(player.id);
          if (player.userId && this.userPlayer.get(player.userId) === player.id) {
            this.userPlayer.delete(player.userId);
          }
        }
      }
    } else {
      const version = findVersion(DEFAULT_VERSION_ID)!;
      room.maxPlayers = version.maxPlayers;
      room.settings = { maxPlayers: version.maxPlayers };
      room.versionId = version.id;
      room.versionName = version.name;
      room.monopoly = undefined;
    }
    this.syncLifecycle(room);
    return room;
  }

  disbandRoom(playerId: string): LeaveRoomResult {
    const room = this.getRoomByPlayerId(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', '仅房主可解散房间');
    if (room.isSandbox) throw new RoomError('SANDBOX_LOCKED', '模拟房不可解散');
    const previousRoomId = room.id;
    const previousHostId = room.hostId;
    this.deleteRoom(room);
    return { room: null, removed: true, disbanded: true, previousRoomId, previousHostId };
  }

  startGame(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxStart(playerId);
    }
    if (room.gameType === 'monopoly') {
      return this.startMonopolyGame(playerId);
    }
    if (room.hostId !== playerId) {
      throw new RoomError('NOT_HOST', '仅房主可开始游戏');
    }
    if (room.status !== 'waiting') {
      throw new RoomError('ALREADY_STARTED', '对局已开始');
    }
    if (room.players.length < 2) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', '至少需要 2 名玩家');
    }
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) {
      throw new RoomError('NOT_ALL_READY', '还有玩家未准备');
    }
    this.setRoomStatus(room, 'selecting');
    assignIdentities(room.players);
    room.players.forEach((p) => {
      p.roleRevealed = p.role === '主公';
      p.general = undefined;
      p.handCards = [];
      p.equipment = [];
      p.judgeCards = [];
      p.handCount = 0;
      p.dead = false;
      p.maxHp = undefined;
      p.hp = undefined;
    });
    this.setupGeneralSelection(room);
    return room;
  }

  private startMonopolyGame(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.hostId !== playerId) {
      throw new RoomError('NOT_HOST', '仅房主可开始游戏');
    }
    if (room.status !== 'waiting') {
      throw new RoomError('ALREADY_STARTED', '对局已开始');
    }
    if (room.players.length < 2) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', '至少需要 2 名玩家');
    }
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) {
      throw new RoomError('NOT_ALL_READY', '还有玩家未准备');
    }
    room.players.forEach((p, index) => {
      p.seat = index + 1;
      p.role = '玩家';
      p.roleRevealed = true;
      p.handCards = [];
      p.handCount = 0;
      p.general = '世界旅客';
      p.hp = undefined;
      p.maxHp = undefined;
      p.dead = false;
    });
    room.monopoly = this.createMonopolyState(room);
    this.setRoomStatus(room, 'playing');
    return room;
  }

  selectGeneral(playerId: string, roomCode: string, generalId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.code !== roomCode) {
      throw new RoomError('E_ROOM_NOT_FOUND', '房间不匹配');
    }
    if (room.isSandbox) {
      throw new RoomError('NOT_SUPPORTED', '模拟测试房不需要选将');
    }
    if (room.status !== 'selecting') {
      throw new RoomError('E_NOT_SELECTING', '当前不是选将阶段');
    }
    this.applyGeneralSelection(room, playerId, generalId);
    if (this.isGeneralSelectionComplete(room)) {
      this.startSelectedGame(room);
    }
    return room;
  }

  ensureSandboxRoom(): Room {
    const existing = this.getRoomByCode(SANDBOX_ROOM_CODE);
    if (existing) return existing;
    const version = findVersion(DEFAULT_VERSION_ID)!;
    const maxPlayers = version.maxPlayers;
    const room: Room = {
      id: uuidv4(),
      code: SANDBOX_ROOM_CODE,
      hostId: '',
      maxPlayers,
      versionId: version.id,
      versionName: version.name,
      players: [],
      status: 'waiting',
      settings: { maxPlayers },
      createdAt: Date.now(),
      isSandbox: true,
      sandbox: { phase: 'lobby', turnIndex: 0, round: 1, log: [] },
    };
    this.syncLifecycle(room);
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(room.code, room.id);
    return room;
  }

  joinSandboxRoom(playerId: string, nickname: string, userId?: string | null): Room {
    const room = this.ensureSandboxRoom();
    const trimmedNick = nickname.trim() || '玩家';

    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = trimmedNick || existing.nickname;
      this.syncLifecycle(room);
      this.playerRoom.set(playerId, room.id);
      this.actingPlayerBySocket.set(playerId, playerId);
      return room;
    }

    if (userId) {
      const boundPlayerId = this.userPlayer.get(userId);
      if (boundPlayerId) {
        const rebound = room.players.find((p) => p.id === boundPlayerId && !p.isVirtual);
        if (rebound) {
          const oldId = rebound.id;
          rebound.id = playerId;
          rebound.userId = userId;
          rebound.connected = true;
          rebound.nickname = trimmedNick || rebound.nickname;
          this.syncLifecycle(room);
          this.playerRoom.delete(oldId);
          this.playerRoom.set(playerId, room.id);
          this.userPlayer.set(userId, playerId);
          if (room.hostId === oldId) room.hostId = playerId;
          this.actingPlayerBySocket.set(playerId, playerId);
          if (room.status === 'playing') {
            this.gameService.remapPlayerId(room.id, oldId, playerId);
            const engine = this.gameService.getRoomEngine(room.id);
            if (engine) this.gameService.syncRoomFromEngine(room, engine);
          }
          return room;
        }
      }
    }

    const rejoin = room.players.find(
      (p) => !p.isVirtual && p.nickname === trimmedNick && !p.connected,
    );
    if (rejoin) {
      const oldId = rejoin.id;
      rejoin.id = playerId;
      rejoin.userId = userId ?? rejoin.userId;
      rejoin.connected = true;
      this.syncLifecycle(room);
      this.playerRoom.delete(oldId);
      this.playerRoom.set(playerId, room.id);
      if (room.hostId === oldId) room.hostId = playerId;
      this.actingPlayerBySocket.set(playerId, playerId);
      if (room.status === 'playing') {
        this.gameService.remapPlayerId(room.id, oldId, playerId);
        const engine = this.gameService.getRoomEngine(room.id);
        if (engine) this.gameService.syncRoomFromEngine(room, engine);
      }
      return room;
    }

    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', '房间已满');
    }
    const hasRealHost = room.players.some((p) => p.id === room.hostId && !p.isVirtual);
    if (!hasRealHost) room.hostId = playerId;
    room.players.push({
      id: playerId,
      userId: userId ?? undefined,
      nickname: trimmedNick || `测试员${room.players.length + 1}`,
      ready: true,
      connected: true,
      handCards: [],
    });
    this.syncLifecycle(room);
    this.playerRoom.set(playerId, room.id);
    this.actingPlayerBySocket.set(playerId, playerId);
    this.bindUserIdToPlayer(playerId, userId);
    return room;
  }

  sandboxAddVirtualPlayer(
    hostPlayerId: string,
    nickname: string,
    general?: string,
  ): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) {
      throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    }
    if (room.hostId !== hostPlayerId) {
      throw new RoomError('NOT_HOST', '仅房主可添加角色');
    }
    if (room.players.length >= room.maxPlayers) {
      throw new RoomError('ROOM_FULL', '房间已满');
    }
    const name = nickname.trim() || `角色${room.players.length + 1}`;
    room.players.push({
      id: uuidv4(),
      nickname: name,
      general: general?.trim() || name,
      ready: true,
      connected: true,
      isVirtual: true,
      handCards: ['杀', '闪', '桃'],
    });
    return room;
  }

  sandboxRemovePlayer(hostPlayerId: string, targetId: string): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    if (room.hostId !== hostPlayerId) {
      throw new RoomError('NOT_HOST', '仅房主可移除角色');
    }
    const target = room.players.find((p) => p.id === targetId);
    if (!target?.isVirtual) {
      throw new RoomError('INVALID_TARGET', '只能移除虚拟角色');
    }
    room.players = room.players.filter((p) => p.id !== targetId);
    if (room.sandbox && room.sandbox.turnIndex >= room.players.length) {
      room.sandbox.turnIndex = 0;
    }
    return room;
  }

  private readonly actingPlayerBySocket = new Map<string, string>();

  resolveActingPlayerId(socketPlayerId: string): string {
    return this.actingPlayerBySocket.get(socketPlayerId) ?? socketPlayerId;
  }

  setActingPlayer(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    const target = room.players.find((p) => p.id === actingPlayerId);
    if (!target) throw new RoomError('PLAYER_NOT_FOUND', '角色不存在');
    this.actingPlayerBySocket.set(socketPlayerId, actingPlayerId);
    return room;
  }

  sandboxStart(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    if (room.hostId !== playerId) {
      throw new RoomError('NOT_HOST', '仅房主可开局');
    }
    const realHost = room.players.find((p) => p.id === room.hostId && !p.isVirtual);
    if (!realHost) {
      throw new RoomError('NOT_HOST', '虚拟角色不能作为房主开局');
    }
    if (room.players.length < 1) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', '请至少添加 1 名角色');
    }
    this.setRoomStatus(room, 'playing');
    const sampleGenerals = [
      '界刘备',
      '界关羽',
      '界赵云',
      '界曹操',
      '界司马懿',
      '孙权',
      '界周瑜',
      '界吕布',
    ];
    const sampleEquip = [
      ['的卢', '诸葛连弩'],
      ['仁王盾'],
      [],
      ['青龙偃月刀'],
      [],
    ];
    let lordAssigned = false;
    room.players.forEach((p, i) => {
      p.seat = i + 1;
      p.role = undefined;
      if (!lordAssigned && !p.isVirtual) {
        p.role = '主公';
        lordAssigned = true;
      } else {
        p.role = '反贼';
      }
      p.maxHp = 4;
      p.hp = p.role === '主公' ? 5 : 4;
      p.equipment = sampleEquip[i % sampleEquip.length] ?? [];
      p.judgeCards = i === 2 ? ['乐不思蜀'] : [];
      if (!p.handCards?.length) {
        p.handCards = ['杀', '闪', '桃', '酒', '过河拆桥'];
      }
      if (!p.general) {
        p.general = sampleGenerals[i % sampleGenerals.length] ?? p.nickname;
      }
    });
    const lordIndex = SangokushiEngine.findLordIndex(room.players);
    const lord = room.players[lordIndex]!;
    room.sandbox = {
      phase: 'playing',
      turnIndex: lordIndex,
      round: 1,
      turnPhase: 'judge',
      log: [],
      prompt: null,
    };

    const engine = this.gameService.createRoomEngine(room);
    engine.start();
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  private requireRoomEngine(room: Room): SangokushiEngine {
    const engine = this.gameService.getRoomEngine(room.id);
    if (!engine) {
      throw new RoomError('ENGINE_MISSING', '对局引擎未初始化');
    }
    return engine;
  }

  private assertPlaying(room: Room): void {
    if (room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    if (room.sandbox.phase === 'finished') {
      throw new RoomError('GAME_OVER', '对局已结束');
    }
  }

  private assertActorInRoom(room: Room, actingPlayerId: string): void {
    const player = room.players.find((p) => p.id === actingPlayerId);
    if (!player?.connected) {
      throw new RoomError('NOT_IN_ROOM', '不在房间内');
    }
  }

  // —— 正式房间对局操作（每人只能操控自己的座位） ——

  gamePlayCard(playerId: string, card: string, handIndex?: number): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxPlayCard(playerId, playerId, card, handIndex);
    }
    this.assertPlaying(room);
    this.assertActorInRoom(room, playerId);
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');
    const engine = this.requireRoomEngine(room);
    const res = engine.initiatePlayCard(playerId, trimmed, handIndex);
    if (!res.ok) throw new RoomError('PLAY_FAILED', res.error ?? '无法出牌');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameConfirmPlay(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxConfirmPlay(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitPromptChoice(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSelectTargets(
    playerId: string,
    promptId: string,
    targetIds: string[],
    zoneCardId?: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSelectTargets(playerId, playerId, promptId, targetIds, zoneCardId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.selectTargets(playerId, promptId, targetIds, zoneCardId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选目标失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSubmitResponse(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSubmitResponse(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitResponse(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '响应失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameUseSkill(playerId: string, skillId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxUseSkill(playerId, playerId, skillId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.initiateSkill(playerId, skillId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '技能失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameRendeGive(
    playerId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxRendeGive(playerId, playerId, targetId, cards, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.rendeGive(
      playerId,
      targetId,
      cards.map((c) => c.trim()).filter(Boolean),
      handIndices,
    );
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '仁德失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameRendeFinish(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxRendeFinish(playerId, playerId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.rendeFinish(playerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束仁德');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameQingnangRecover(playerId: string, targetId: string, handIndices: number | number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxQingnangRecover(playerId, playerId, targetId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.qingnangRecover(playerId, targetId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '青囊失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameZhihengConfirm(playerId: string, handIndices: number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxZhihengConfirm(playerId, playerId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.zhihengConfirm(playerId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '制衡失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameModifyJudge(playerId: string, promptId: string, handIndex: number): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxModifyJudge(playerId, playerId, promptId, handIndex);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.submitModifyJudge(playerId, promptId, handIndex);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '改判失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameSkipModifyJudge(playerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSkipModifyJudge(playerId, playerId, promptId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.skipModifyJudge(playerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameDiscardCards(playerId: string, promptId: string, handIndices: number[]): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxDiscardCards(playerId, playerId, promptId, handIndices);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.submitDiscard(playerId, promptId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameCancelDiscard(playerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxCancelDiscard(playerId, playerId, promptId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.cancelDiscard(playerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '取消弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async gameSelectZoneCard(
    playerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxSelectZoneCard(playerId, playerId, promptId, choiceId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = await engine.submitZoneCard(playerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  gameEndTurn(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    if (room.isSandbox) {
      return this.sandboxEndTurn(playerId, playerId);
    }
    this.assertPlaying(room);
    const engine = this.requireRoomEngine(room);
    const res = engine.endTurn(playerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束回合');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  getFilteredRoomForPlayer(roomId: string, playerId: string): Room | null {
    const room = this.getRoomById(roomId);
    if (!room) return null;
    if (room.status === 'selecting') {
      return this.filterSelectingRoomForPlayer(room, playerId);
    }
    return this.gameService.filterRoomForPlayer(room, playerId);
  }

  private requireSandboxEngine(room: Room): SangokushiEngine {
    const engine = this.gameService.getSandboxEngine(room.id);
    if (!engine) {
      throw new RoomError('ENGINE_MISSING', '对局引擎未初始化');
    }
    return engine;
  }

  sandboxPlayCard(
    socketPlayerId: string,
    actingPlayerId: string,
    card: string,
    handIndex?: number,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');

    const engine = this.requireSandboxEngine(room);
    const res = engine.initiatePlayCard(actingPlayerId, trimmed, handIndex);
    if (!res.ok) throw new RoomError('PLAY_FAILED', res.error ?? '无法出牌');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxConfirmPlay(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing') {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitPromptChoice(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSelectTargets(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    targetIds: string[],
    zoneCardId?: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.selectTargets(
      actingPlayerId,
      promptId,
      targetIds,
      zoneCardId,
    );
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选目标失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSubmitResponse(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitResponse(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '响应失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxUseSkill(
    socketPlayerId: string,
    actingPlayerId: string,
    skillId: string,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.initiateSkill(actingPlayerId, skillId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '技能失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxRendeGive(
    socketPlayerId: string,
    actingPlayerId: string,
    targetId: string,
    cards: string[],
    handIndices?: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.rendeGive(
      actingPlayerId,
      targetId,
      cards.map((c) => c.trim()).filter(Boolean),
      handIndices,
    );
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '仁德失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxRendeFinish(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.rendeFinish(actingPlayerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束仁德');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxQingnangRecover(
    socketPlayerId: string,
    actingPlayerId: string,
    targetId: string,
    handIndices: number | number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.qingnangRecover(actingPlayerId, targetId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '青囊失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxZhihengConfirm(
    socketPlayerId: string,
    actingPlayerId: string,
    handIndices: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.zhihengConfirm(actingPlayerId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '制衡失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxModifyJudge(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    handIndex: number,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.submitModifyJudge(actingPlayerId, promptId, handIndex);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '改判失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxSkipModifyJudge(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.skipModifyJudge(actingPlayerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '操作失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxDiscardCards(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    handIndices: number[],
  ): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.submitDiscard(actingPlayerId, promptId, handIndices);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxCancelDiscard(socketPlayerId: string, actingPlayerId: string, promptId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = engine.cancelDiscard(actingPlayerId, promptId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '取消弃牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  async sandboxSelectZoneCard(
    socketPlayerId: string,
    actingPlayerId: string,
    promptId: string,
    choiceId: string,
  ): Promise<Room> {
    const room = this.getRoomByPlayerId(socketPlayerId);
    const engine = this.requireSandboxEngine(room);
    const res = await engine.submitZoneCard(actingPlayerId, promptId, choiceId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '选牌失败');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  sandboxAddCard(
    hostPlayerId: string,
    targetId: string,
    card: string,
  ): Room {
    const room = this.getRoomByPlayerId(hostPlayerId);
    if (!room.isSandbox) throw new RoomError('NOT_SANDBOX', '非模拟测试房');
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw new RoomError('PLAYER_NOT_FOUND', '角色不存在');
    const trimmed = card.trim();
    if (!trimmed) throw new RoomError('INVALID_CARD', '请输入牌名');
    if (!target.handCards) target.handCards = [];
    target.handCards.push(trimmed);
    return room;
  }

  sandboxEndTurn(socketPlayerId: string, actingPlayerId: string): Room {
    const room = this.getRoomByPlayerId(socketPlayerId);
    if (!room.isSandbox || room.status !== 'playing' || !room.sandbox) {
      throw new RoomError('NOT_PLAYING', '对局未开始');
    }
    const engine = this.requireSandboxEngine(room);
    const res = engine.endTurn(actingPlayerId);
    if (!res.ok) throw new RoomError('ACTION_FAILED', res.error ?? '无法结束回合');
    this.gameService.syncRoomFromEngine(room, engine);
    return room;
  }

  monopolyRoll(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    const state = this.requireMonopolyState(room);
    const current = state.players[state.turnIndex];
    if (!current || current.playerId !== playerId) {
      throw new RoomError('NOT_YOUR_TURN', '当前不是你的回合');
    }
    if (state.pendingAction) {
      throw new RoomError('ACTION_PENDING', '请先处理当前位置');
    }
    const dice: [number, number] = [this.rollDie(), this.rollDie()];
    const steps = dice[0] + dice[1];
    const nextPosition = (current.position + steps) % state.board.length;
    if (current.position + steps >= state.board.length) {
      current.cash += MONOPOLY_PASS_START_BONUS;
      state.log.unshift(`${current.nickname} 经过起点，获得 ${MONOPOLY_PASS_START_BONUS} 金币`);
    }
    current.position = nextPosition;
    state.lastDice = dice;
    const cell = state.board[nextPosition]!;
    state.log.unshift(`${current.nickname} 掷出 ${dice[0]}+${dice[1]}，到达 ${cell.name}`);
    this.resolveMonopolyCell(state, current.playerId, cell.index);
    state.log = state.log.slice(0, 12);
    return room;
  }

  monopolyBuy(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    const state = this.requireMonopolyState(room);
    const current = state.players[state.turnIndex];
    if (!current || current.playerId !== playerId) throw new RoomError('NOT_YOUR_TURN', '当前不是你的回合');
    const cell = state.board[current.position];
    if (!cell || state.pendingAction !== 'buy_or_skip' || cell.type !== 'city' || cell.ownerId) {
      throw new RoomError('CANNOT_BUY', '当前位置不可购买');
    }
    if (current.cash < cell.price) throw new RoomError('NO_MONEY', '金币不足');
    current.cash -= cell.price;
    current.properties.push(cell.index);
    cell.ownerId = playerId;
    state.log.unshift(`${current.nickname} 购买 ${cell.name}，花费 ${cell.price} 金币`);
    state.pendingAction = null;
    this.advanceMonopolyTurn(state);
    return room;
  }

  monopolyUpgrade(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    const state = this.requireMonopolyState(room);
    const current = state.players[state.turnIndex];
    if (!current || current.playerId !== playerId) throw new RoomError('NOT_YOUR_TURN', '当前不是你的回合');
    const cell = state.board[current.position];
    if (!cell || state.pendingAction !== 'upgrade_or_skip' || cell.type !== 'city' || cell.ownerId !== playerId) {
      throw new RoomError('CANNOT_UPGRADE', '当前位置不可升级');
    }
    const cost = this.nextMonopolyUpgradeCost(cell);
    if (cost == null) throw new RoomError('MAX_LEVEL', '地块已满级');
    if (current.cash < cost) throw new RoomError('NO_MONEY', '金币不足');
    current.cash -= cost;
    cell.level = (cell.level ?? 1) + 1;
    cell.rent = this.currentMonopolyRent(cell);
    state.log.unshift(`${current.nickname} 升级 ${cell.name} 到 Lv.${cell.level}，花费 ${cost} 金币`);
    state.pendingAction = null;
    this.advanceMonopolyTurn(state);
    return room;
  }

  monopolySkip(playerId: string): Room {
    const room = this.getRoomByPlayerId(playerId);
    const state = this.requireMonopolyState(room);
    const current = state.players[state.turnIndex];
    if (!current || current.playerId !== playerId) throw new RoomError('NOT_YOUR_TURN', '当前不是你的回合');
    const cell = state.board[current.position];
    if (state.pendingAction === 'buy_or_skip' && cell) {
      state.log.unshift(`${current.nickname} 放弃购买 ${cell.name}`);
    }
    state.pendingAction = null;
    this.advanceMonopolyTurn(state);
    return room;
  }

  private createMonopolyState(room: Room): MonopolyGameState {
    return {
      phase: 'playing',
      turnIndex: 0,
      round: 1,
      board: MONOPOLY_WORLD_BOARD.map((cell) => ({ ...cell })),
      players: room.players.map((player) => ({
        playerId: player.id,
        nickname: player.nickname,
        position: 0,
        cash: MONOPOLY_START_CASH,
        properties: [],
      })),
      log: ['中国版大富翁开始，游玩免费。'],
      pendingAction: null,
    };
  }

  private requireMonopolyState(room: Room): MonopolyGameState {
    if (room.gameType !== 'monopoly' || room.status !== 'playing' || !room.monopoly) {
      throw new RoomError('NOT_PLAYING', '大富翁未开始');
    }
    return room.monopoly;
  }

  private rollDie(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private resolveMonopolyCell(state: MonopolyGameState, playerId: string, cellIndex: number): void {
    const player = state.players.find((item) => item.playerId === playerId);
    const cell = state.board[cellIndex];
    if (!player || !cell) return;
    if (cell.type === 'city' && !cell.ownerId) {
      state.pendingAction = 'buy_or_skip';
      state.log.unshift(`${cell.name} 尚未归属，可用 ${cell.price} 金币购买`);
      return;
    }
    if (cell.type === 'city' && cell.ownerId === playerId) {
      const cost = this.nextMonopolyUpgradeCost(cell);
      if (cost != null) {
        state.pendingAction = 'upgrade_or_skip';
        state.log.unshift(`${cell.name} 可升级，费用 ${cost} 金币`);
        return;
      }
      state.log.unshift(`${cell.name} 已满级，跳过升级`);
    }
    if (cell.type === 'city' && cell.ownerId && cell.ownerId !== playerId) {
      const owner = state.players.find((item) => item.playerId === cell.ownerId);
      const paid = Math.min(player.cash, this.currentMonopolyRent(cell));
      player.cash -= paid;
      if (owner) owner.cash += paid;
      state.log.unshift(`${player.nickname} 向 ${owner?.nickname ?? '地主'} 支付 ${paid} 金币过路费`);
    } else if (cell.type === 'tax') {
      const paid = Math.min(player.cash, cell.rent);
      player.cash -= paid;
      state.log.unshift(`${player.nickname} 缴纳税费 ${paid} 金币`);
    } else if (cell.type === 'chance') {
      player.cash += 60;
      state.log.unshift(`${player.nickname} 获得机会奖励 60 金币`);
    }
    this.advanceMonopolyTurn(state);
  }

  private currentMonopolyRent(cell: MonopolyBoardCell): number {
    const level = Math.max(1, cell.level ?? 1);
    return cell.rents?.[level - 1] ?? cell.rent;
  }

  private nextMonopolyUpgradeCost(cell: MonopolyBoardCell): number | null {
    const level = Math.max(1, cell.level ?? 1);
    return cell.upgradeCosts?.[level - 1] ?? null;
  }

  private advanceMonopolyTurn(state: MonopolyGameState): void {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    if (state.turnIndex === 0) state.round += 1;
    state.pendingAction = null;
    state.log = state.log.slice(0, 12);
  }

  listPublicRooms(versionFilter?: string, viewerPlayerId?: string, viewerUserId?: string, gameTypeFilter?: GameType | 'all'): RoomListItem[] {
    this.ensureSandboxRoom();
    const mappedPlayerId = viewerUserId ? this.userPlayer.get(viewerUserId) : undefined;
    return [...this.roomsById.values()]
      .filter((r) => r.players.length > 0 || r.isSandbox)
      .filter((r) => !gameTypeFilter || gameTypeFilter === 'all' || (r.gameType ?? 'sanguosha') === gameTypeFilter)
      .filter((r) => (r.gameType ?? 'sanguosha') !== 'sanguosha' || !versionFilter || (r.versionId ?? DEFAULT_VERSION_ID) === versionFilter)
      .map((r) => {
        const host = r.players.find((p) => p.id === r.hostId);
        const isMember = r.players.some((p) => p.id === viewerPlayerId || p.id === mappedPlayerId);
        return {
          code: r.code,
          status: r.status,
          playerCount: r.players.length,
          maxPlayers: r.maxPlayers,
          ownerNickname: host?.nickname ?? '—',
          ownerUserId: host?.userId,
          versionId: r.versionId ?? DEFAULT_VERSION_ID,
          versionName:
            r.versionName ?? findVersion(r.versionId ?? DEFAULT_VERSION_ID)?.name ?? '未知版本',
          gameType: r.gameType ?? 'sanguosha',
          gameName: gameName(r.gameType),
          isSandbox: r.isSandbox,
          isMember,
          joinLabel: isMember ? ('返回' as const) : ('加入' as const),
          _v: 1 as const,
        };
      })
      .sort((a, b) => {
        if (a.isSandbox) return -1;
        if (b.isSandbox) return 1;
        return a.code.localeCompare(b.code);
      });
  }

  getRoomByPlayerId(playerId: string): Room {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) throw new RoomError('NOT_IN_ROOM', '不在房间内');
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', '房间不存在');
    return room;
  }

  getRoomByCode(code: string): Room | null {
    const roomId = this.roomIdByCode.get(code);
    if (!roomId) return null;
    return this.roomsById.get(roomId) ?? null;
  }

  getRoomById(id: string): Room | null {
    return this.roomsById.get(id) ?? null;
  }

  listWaitingRooms(): Room[] {
    return [...this.roomsById.values()].filter((r) => r.status === 'waiting');
  }

  getActingPlayerId(socketPlayerId: string): string {
    return this.resolveActingPlayerId(socketPlayerId);
  }

  completeFinishedRoom(roomId: string): Room | null {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    if (room.status !== 'finished') return room;

    const victory = room.sandbox?.victory;
    if (victory) {
      room.settlementRecords = [
        ...(room.settlementRecords ?? []),
        {
          id: uuidv4(),
          finishedAt: Date.now(),
          winners: [...victory.winners],
          message: victory.message,
        },
      ];
    }
    this.setRoomStatus(room, 'waiting');
    room.players.forEach((player) => {
      player.ready = false;
    });
    if (room.sandbox) {
      room.sandbox.phase = 'lobby';
      room.sandbox.turnPhase = undefined;
      room.sandbox.prompt = null;
      room.sandbox.victory = null;
    }
    return room;
  }

  private setupGeneralSelection(room: Room): void {
    const optionsByPlayer = new Map<string, string[]>();
    const pool = this.shuffle(CharacterRegistry.getAll().map((ch) => ch.id));
    let cursor = 0;
    for (const player of room.players) {
      const optionCount = player.role === '主公' ? LORD_GENERAL_OPTION_COUNT : GENERAL_OPTION_COUNT;
      const picks: string[] = [];
      while (picks.length < optionCount) {
        const fallback = CharacterRegistry.getAll()[picks.length % CharacterRegistry.getAll().length];
        const id = pool[cursor++ % pool.length] ?? fallback?.id;
        if (id && !picks.includes(id)) picks.push(id);
      }
      optionsByPlayer.set(player.id, picks);
    }
    this.generalOptionsByRoom.set(room.id, optionsByPlayer);
    room.generalSelection = {
      deadlineAt: Date.now() + env.selectingTimeoutSec * 1000,
      timeoutSec: env.selectingTimeoutSec,
      selected: [],
    };
    this.scheduleSelectingTimeout(room);
  }

  private scheduleSelectingTimeout(room: Room): void {
    this.clearSelectingTimer(room.id);
    if (room.status !== 'selecting' || !room.generalSelection) return;
    const delay = Math.max(0, room.generalSelection.deadlineAt - Date.now());
    const timer = setTimeout(() => {
      const latest = this.roomsById.get(room.id);
      if (!latest || latest.status !== 'selecting') return;
      for (const player of latest.players) {
        const alreadySelected = latest.generalSelection?.selected.some((item) => item.playerId === player.id);
        if (alreadySelected) continue;
        const defaultGeneralId = this.generalOptionsByRoom.get(latest.id)?.get(player.id)?.[0];
        if (defaultGeneralId) this.applyGeneralSelection(latest, player.id, defaultGeneralId);
      }
      if (this.isGeneralSelectionComplete(latest)) {
        this.startSelectedGame(latest);
        this.roomChanged?.(latest);
      }
    }, delay);
    this.selectingTimers.set(room.id, timer);
  }

  private clearSelectingTimer(roomId: string): void {
    const timer = this.selectingTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.selectingTimers.delete(roomId);
  }

  private applyGeneralSelection(room: Room, playerId: string, generalId: string): void {
    const options = this.generalOptionsByRoom.get(room.id)?.get(playerId) ?? [];
    if (!options.includes(generalId)) {
      throw new RoomError('E_INVALID_GENERAL_OPTION', '请选择候选武将');
    }
    const ch = CharacterRegistry.getById(generalId);
    if (!ch) throw new RoomError('E_INVALID_GENERAL_OPTION', '武将不存在');
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('PLAYER_NOT_FOUND', '玩家不存在');
    const selectedByOther = room.generalSelection?.selected.some(
      (item) => item.playerId !== playerId && item.generalId === generalId,
    );
    if (selectedByOther) {
      throw new RoomError('E_INVALID_GENERAL_OPTION', '该武将已被选择');
    }
    player.general = ch.name;
    room.generalSelection = room.generalSelection
      ? {
          ...room.generalSelection,
          selected: [
            ...room.generalSelection.selected.filter((item) => item.playerId !== playerId),
            { playerId, generalId: ch.id, generalName: ch.name },
          ],
        }
      : room.generalSelection;
  }

  private isGeneralSelectionComplete(room: Room): boolean {
    const selectedIds = new Set(room.generalSelection?.selected.map((item) => item.playerId) ?? []);
    return room.players.every((player) => selectedIds.has(player.id));
  }

  private startSelectedGame(room: Room): void {
    this.clearSelectingTimer(room.id);
    this.generalOptionsByRoom.delete(room.id);
    this.setRoomStatus(room, 'playing');
    room.generalSelection = undefined;
    room.players.forEach((p) => {
      p.handCards = [];
      p.equipment = [];
      p.judgeCards = [];
      const ch = p.general ? CharacterRegistry.resolve(p.general) : undefined;
      const isLord = p.role === '主公';
      p.maxHp = (ch?.maxHp ?? 4) + (isLord ? 1 : 0);
      p.hp = p.maxHp;
      p.dead = false;
    });
    const turnLordIndex = SangokushiEngine.findLordIndex(room.players);
    room.sandbox = {
      phase: 'playing',
      turnIndex: turnLordIndex,
      round: 1,
      turnPhase: 'judge',
      log: [],
      prompt: null,
    };
    const engine = this.gameService.createRoomEngine(room);
    engine.start();
    this.gameService.syncRoomFromEngine(room, engine);
  }

  private filterSelectingRoomForPlayer(room: Room, playerId: string): Room {
    const clone: Room = JSON.parse(JSON.stringify(room)) as Room;
    if (clone.generalSelection) {
      const optionIds = this.generalOptionsByRoom.get(room.id)?.get(playerId) ?? [];
      clone.generalSelection.myOptions = optionIds
        .map((id) => CharacterRegistry.getById(id))
        .filter((ch): ch is NonNullable<typeof ch> => !!ch)
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          kingdom: ch.kingdom,
          hp: ch.maxHp,
          maxHp: ch.maxHp,
          skills: ch.skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
          })),
        }));
    }
    for (const p of clone.players) {
      const isSelf = p.id === playerId;
      if (!isSelf && p.role !== '主公') p.role = '？';
      p.handCards = [];
      p.handCount = 0;
    }
    return clone;
  }

  private remapSelectingPlayer(room: Room, oldPlayerId: string, newPlayerId: string): void {
    const options = this.generalOptionsByRoom.get(room.id);
    const oldOptions = options?.get(oldPlayerId);
    if (oldOptions) {
      options!.delete(oldPlayerId);
      options!.set(newPlayerId, oldOptions);
    }
    if (room.generalSelection) {
      room.generalSelection.selected = room.generalSelection.selected.map((item) =>
        item.playerId === oldPlayerId ? { ...item, playerId: newPlayerId } : item,
      );
    }
  }

  private clearSelectingPlayer(room: Room, playerId: string): void {
    const options = this.generalOptionsByRoom.get(room.id);
    options?.delete(playerId);
    if (room.generalSelection) {
      room.generalSelection.selected = room.generalSelection.selected.filter(
        (item) => item.playerId !== playerId,
      );
    }
  }

  private rebuildGeneralSelectionAfterLeave(room: Room): void {
    if (room.players.length === 0) return;
    if (!room.generalSelection) {
      this.setupGeneralSelection(room);
      return;
    }

    room.generalSelection = {
      ...room.generalSelection,
      deadlineAt: Date.now() + env.selectingTimeoutSec * 1000,
      timeoutSec: env.selectingTimeoutSec,
    };
    this.scheduleSelectingTimeout(room);
  }

  private transferHost(room: Room, excludingPlayerId?: string): string | undefined {
    const candidates = room.players.filter((p) => !p.isVirtual && p.id !== excludingPlayerId);
    const next = candidates.find((p) => p.connected) ?? candidates[0];
    if (!next) return undefined;
    room.hostId = next.id;
    this.syncLifecycle(room);
    return next.id;
  }

  private setRoomStatus(room: Room, status: Room['status']): void {
    room.status = status;
    this.syncLifecycle(room);
  }

  private syncLifecycle(
    room: Room,
    patch: { hostTransferPending?: boolean; disconnectGraceUntil?: number } = {},
  ): void {
    room.roomLifecycle = {
      state: room.status,
      hostTransferPending: patch.hostTransferPending ?? false,
      disconnectGraceUntil: patch.disconnectGraceUntil,
    };
  }

  private shuffle<T>(arr: T[]): T[] {
    const pile = [...arr];
    for (let i = pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pile[i], pile[j]] = [pile[j]!, pile[i]!];
    }
    return pile;
  }

  private bindUserIdToPlayer(playerId: string, userId?: string | null): void {
    if (userId) this.userPlayer.set(userId, playerId);
  }

  private assertSingleActiveRoom(playerId: string, userId?: string | null): void {
    const activePlayerId = userId ? this.userPlayer.get(userId) : playerId;
    const activeRoomId = activePlayerId ? this.playerRoom.get(activePlayerId) : undefined;
    const activeRoom = activeRoomId ? this.roomsById.get(activeRoomId) : undefined;
    if (activeRoom && !activeRoom.isSandbox) {
      throw new RoomError('E_ALREADY_IN_ROOM', '你已在一个房间中，请先退出或解散当前房间');
    }
  }

  private generateUniqueCode(): string {
    for (let i = 0; i < MAX_CODE_RETRIES; i++) {
      const num =
        Math.floor(Math.random() * (CODE_MAX - CODE_MIN + 1)) + CODE_MIN;
      const code = String(num);
      if (!this.roomIdByCode.has(code)) return code;
    }
    throw new RoomError('CODE_GENERATION_FAILED', '无法生成房间号，请重试');
  }

  private deleteRoom(room: Room): void {
    this.clearSelectingTimer(room.id);
    this.generalOptionsByRoom.delete(room.id);
    this.gameService.destroyEngine(room.id);
    this.roomsById.delete(room.id);
    this.roomIdByCode.delete(room.code);
    for (const p of room.players) {
      this.playerRoom.delete(p.id);
    }
  }
}

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}
