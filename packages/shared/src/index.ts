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

export type TurnPhase =
  | 'prepare'
  | 'judge'
  | 'before_draw'
  | 'draw'
  | 'play'
  | 'discard'
  | 'end';

export type PromptType =
  | 'use_skill'
  | 'play_card_confirm'
  | 'select_targets'
  | 'response'
  | 'dying_rescue'
  | 'discard_cards'
  | 'modify_judge'
  | 'select_zone_card';

export interface PromptSkillInfo {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface GamePrompt {
  id: string;
  type: PromptType;
  playerId: string;
  cardId?: string;
  cardName?: string;
  skillId?: string;
  skillName?: string;
  sourcePlayerId?: string;
  targetPlayerIds?: string[];
  validTargetIds?: string[];
  validResponseCards?: string[];
  dyingPlayerId?: string;
  discardCount?: number;
  discardHandIndices?: number[];
  zoneCardOptions?: { id: string; label: string }[];
  guanxingCards?: string[];
  characterSkills?: PromptSkillInfo[];
  autoCloseAfterSubmit?: boolean;
  judgeCardName?: string;
  judgeResult?: string;
  judgeTargetId?: string;
  message: string;
  options?: { id: string; label: string }[];
}

export interface SandboxGameState {
  phase: 'lobby' | 'playing';
  turnIndex: number;
  round: number;
  turnPhase?: TurnPhase;
  /** 最近操作记录（表格中展示） */
  log: string[];
  /** 等待玩家操作的 UI 提示（由引擎下发） */
  prompt?: GamePrompt | null;
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
  'sandbox:playCard': (payload: { card: string; handIndex?: number }) => void;
  'sandbox:confirmPlay': (payload: { promptId: string; choiceId: string }) => void;
  'sandbox:selectTargets': (payload: { promptId: string; targetIds: string[] }) => void;
  'sandbox:submitResponse': (payload: { promptId: string; choiceId: string }) => void;
  'sandbox:useSkill': (payload: { skillId: string }) => void;
  'sandbox:rendeGive': (payload: {
    targetId: string;
    cards: string[];
    handIndices?: number[];
  }) => void;
  'sandbox:rendeFinish': () => void;
  'sandbox:zhihengConfirm': (payload: { handIndices: number[] }) => void;
  'sandbox:modifyJudge': (payload: { promptId: string; handIndex: number }) => void;
  'sandbox:skipModifyJudge': (payload: { promptId: string }) => void;
  'sandbox:discardCards': (payload: { promptId: string; handIndices: number[] }) => void;
  'sandbox:cancelDiscard': (payload: { promptId: string }) => void;
  'sandbox:selectZoneCard': (payload: { promptId: string; choiceId: string }) => void;
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
