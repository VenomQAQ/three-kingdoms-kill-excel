export type RoomStatus = 'waiting' | 'playing' | 'finished';

/** 固定模拟测试房间号 */
export const SANDBOX_ROOM_CODE = '70755712';

export interface RoomPlayer {
  id: string;
  nickname: string;
  seat?: number;
  ready: boolean;
  connected: boolean;
  /** 由房主在本机添加的虚拟角色（单连接多控） */
  isVirtual?: boolean;
  /** 模拟对局手牌 */
  handCards?: string[];
  /** 模拟武将名 */
  general?: string;
  /** 身份 */
  role?: string;
  hp?: number;
  maxHp?: number;
  /** 装备区 */
  equipment?: string[];
  /** 判定区 */
  judgeCards?: string[];
}

export interface SandboxGameState {
  phase: 'lobby' | 'playing';
  turnIndex: number;
  round: number;
  /** 最近操作记录（表格中展示） */
  log: string[];
}

export interface RoomSettings {
  maxPlayers: number;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  players: RoomPlayer[];
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: number;
  isSandbox?: boolean;
  sandbox?: SandboxGameState;
}

export interface RoomListItem {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostNickname: string;
  isSandbox?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  nickname: string;
  content: string;
  timestamp: number;
}

/** Client → Server */
export interface ClientToServerEvents {
  'room:create': (payload: { nickname: string }, ack?: (res: RoomCreateAck) => void) => void;
  'room:join': (payload: { code: string; nickname: string }, ack?: (res: RoomJoinAck) => void) => void;
  'room:leave': () => void;
  'room:ready': (payload: { ready: boolean }) => void;
  'room:start': () => void;
  'sandbox:addPlayer': (
    payload: { nickname: string; general?: string },
    ack?: (res: RoomJoinAck) => void,
  ) => void;
  'sandbox:removePlayer': (payload: { playerId: string }) => void;
  'sandbox:switchActor': (payload: { playerId: string }) => void;
  'sandbox:start': () => void;
  'sandbox:playCard': (payload: { card: string }) => void;
  'sandbox:addCard': (payload: { playerId: string; card: string }) => void;
  'sandbox:endTurn': () => void;
  'chat:send': (payload: { content: string }) => void;
  'chat:history': (ack?: (messages: ChatMessage[]) => void) => void;
}

/** Server → Client */
export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:joined': (room: Room) => void;
  'room:state': (room: Room) => void;
  'room:error': (error: { code: string; message: string }) => void;
  'room:playerLeft': (payload: { playerId: string }) => void;
  'chat:message': (message: ChatMessage) => void;
  'game:started': (payload: { roomId: string }) => void;
  'sandbox:actor': (payload: { actingPlayerId: string }) => void;
}

export type RoomCreateAck =
  | { ok: true; room: Room; playerId: string }
  | { ok: false; error: string };

export type RoomJoinAck =
  | { ok: true; room: Room; playerId: string }
  | { ok: false; error: string };

export const WS_EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
} as const;

export const MAX_ROOM_PLAYERS = 10;
export const ROOM_CODE_LENGTH = 8;
