export type RoomStatus = 'waiting' | 'selecting' | 'playing' | 'finished';

export type GameType = 'sanguosha' | 'monopoly';

export interface GameStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export type GameStatsKey = 'sanguosha' | 'lianliankan' | 'monopoly';

export interface GeneralOption {
  id: string;
  name: string;
  kingdom: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number;
  maxHp: number;
  skills: Array<{ name: string; description: string }>;
}

export interface GeneralSelectionState {
  deadlineAt: number;
  timeoutSec: number;
  selected: Array<{ playerId: string; generalId: string; generalName: string }>;
  myOptions?: GeneralOption[];
}

/** 固定模拟测试房间号 */
export const SANDBOX_ROOM_CODE = '70755712';

export interface RoomPlayer {
  id: string;
  userId?: string;
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
  /** 身份是否已公开 */
  roleRevealed?: boolean;
  /** 是否阵亡 */
  dead?: boolean;
  /** 手牌数（他人视角过滤后） */
  handCount?: number;
  hp?: number;
  maxHp?: number;
  /** 装备区 */
  equipment?: string[];
  /** 判定区 */
  judgeCards?: string[];
}

export type RoomLeaveReason = 'manual' | 'disconnect' | 'host-transfer' | 'room-disband' | 'evict';

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
  | 'select_zone_card'
  | 'pick_revealed'
  | 'assign_revealed';

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
  skillCardOptions?: { id: string; label: string }[];
  guanxingCards?: string[];
  characterSkills?: PromptSkillInfo[];
  autoCloseAfterSubmit?: boolean;
  skillAction?:
    | 'give_cards'
    | 'discard_recover'
    | 'discard_draw'
    | 'target_choice'
    | 'discard_card_target_pair'
    | 'give_card_duel_target'
    | 'discard_red_then_choose'
    | 'pindian'
    | 'recover_choice'
    | 'virtual_basic';
  judgeCardName?: string;
  judgeResult?: string;
  judgeTargetId?: string;
  message: string;
  options?: { id: string; label: string }[];
}

export interface SandboxGameState {
  phase: 'lobby' | 'playing' | 'finished';
  turnIndex: number;
  round: number;
  turnPhase?: TurnPhase;
  /** 最近操作记录（表格中展示） */
  log: string[];
  /** 等待玩家操作的 UI 提示（由引擎下发） */
  prompt?: GamePrompt | null;
  /** 对局结束信息 */
  victory?: { winners: string[]; message: string } | null;
}

export interface RoomSettings {
  maxPlayers: number;
}

export type MonopolyCellType = 'start' | 'city' | 'tax' | 'chance' | 'fate' | 'rail' | 'utility' | 'bonus' | 'jail' | 'rest';

export interface MonopolyBoardCell {
  index: number;
  name: string;
  country: string;
  type: MonopolyCellType;
  price: number;
  rent: number;
  rents?: number[];
  upgradeCosts?: number[];
  level?: number;
  colorGroup?: string;
  displayPrice?: number;
  ownerId?: string;
}

export interface MonopolyPlayerState {
  playerId: string;
  nickname: string;
  position: number;
  cash: number;
  properties: number[];
  bankrupt?: boolean;
}

export interface MonopolyGameState {
  phase: 'lobby' | 'playing' | 'finished';
  turnIndex: number;
  round: number;
  board: MonopolyBoardCell[];
  players: MonopolyPlayerState[];
  log: string[];
  lastDice?: [number, number];
  pendingAction?: 'buy_or_skip' | 'upgrade_or_skip' | null;
}

export interface RoomLifecycleState {
  state: RoomStatus;
  hostTransferPending?: boolean;
  disconnectGraceUntil?: number;
}

export interface RoomSettlementRecord {
  id: string;
  finishedAt: number;
  winners: string[];
  message: string;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  /** 三国杀版本 id（REQ-2026-001）；老 room 兼容默认 'standard-2014' */
  versionId?: string;
  /** 三国杀版本中文名 */
  versionName?: string;
  players: RoomPlayer[];
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: number;
  isSandbox?: boolean;
  sandbox?: SandboxGameState;
  generalSelection?: GeneralSelectionState;
  roomLifecycle?: RoomLifecycleState;
  settlementRecords?: RoomSettlementRecord[];
  gameType?: GameType;
  monopoly?: MonopolyGameState;
}

export interface RoomListItem {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  ownerNickname: string;
  ownerUserId?: string;
  versionId?: string;
  versionName: string;
  isSandbox?: boolean;
  isMember?: boolean;
  joinLabel?: '加入' | '返回';
  gameType?: GameType;
  gameName?: string;
  _v: 1;
}

export interface VersionDetail {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  generals: Array<{
    id: string;
    name: string;
    kingdom: 'wei' | 'shu' | 'wu' | 'qun';
    hp: number;
  }>;
  cards: {
    basic: string[];
    trick: string[];
    equipment: string[];
  };
  unlockHint: string;
  readOnly: true;
  _v: 1;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  nickname: string;
  content: string;
  timestamp: number;
  system?: boolean;
}

/** Client → Server */
export interface ClientToServerEvents {
  'room:create': (payload: { nickname: string; versionId?: string; gameType?: GameType }, ack?: (res: RoomCreateAck) => void) => void;
  'room:join': (
    payload: { code: string; nickname?: string; _v?: 1 },
    ack?: (res: RoomJoinAck) => void,
  ) => void;
  'room:leave': (payload?: { code?: string; reason?: RoomLeaveReason; _v?: 1 }) => void;
  'room:disband': (payload?: { code?: string; _v?: 1 }) => void;
  'room:switchGame': (payload: { gameType: GameType; _v?: 1 }) => void;
  'room:ready': (payload: { ready: boolean }) => void;
  'room:start': () => void;
  'general:select': (payload: { roomCode: string; generalId: string; _v?: 1 }) => void;
  'sandbox:addPlayer': (
    payload: { nickname: string; general?: string },
    ack?: (res: RoomJoinAck) => void,
  ) => void;
  'sandbox:removePlayer': (payload: { playerId: string }) => void;
  'sandbox:switchActor': (payload: { playerId: string }) => void;
  'sandbox:start': () => void;
  'sandbox:playCard': (payload: { card: string; handIndex?: number }) => void;
  'sandbox:confirmPlay': (payload: { promptId: string; choiceId: string }) => void;
  'sandbox:selectTargets': (payload: {
    promptId: string;
    targetIds: string[];
    zoneCardId?: string;
  }) => void;
  'sandbox:submitResponse': (payload: { promptId: string; choiceId: string }) => void;
  'sandbox:useSkill': (payload: { skillId: string }) => void;
  'sandbox:rendeGive': (payload: {
    targetId: string;
    cards: string[];
    handIndices?: number[];
  }) => void;
  'sandbox:rendeFinish': () => void;
  'sandbox:qingnangRecover': (payload: { targetId: string; handIndex?: number; handIndices?: number[] }) => void;
  'sandbox:zhihengConfirm': (payload: { handIndices: number[] }) => void;
  'sandbox:modifyJudge': (payload: { promptId: string; handIndex: number }) => void;
  'sandbox:skipModifyJudge': (payload: { promptId: string }) => void;
  'sandbox:discardCards': (payload: { promptId: string; handIndices: number[] }) => void;
  'sandbox:cancelDiscard': (payload: { promptId: string }) => void;
  'sandbox:selectZoneCard': (payload: { promptId: string; choiceId: string }) => void;
  'sandbox:addCard': (payload: { playerId: string; card: string }) => void;
  'sandbox:endTurn': () => void;
  /** 正式房间对局操作（每人操控自己的座位） */
  'game:playCard': (payload: { card: string; handIndex?: number }) => void;
  'game:confirmPlay': (payload: { promptId: string; choiceId: string }) => void;
  'game:selectTargets': (payload: {
    promptId: string;
    targetIds: string[];
    zoneCardId?: string;
  }) => void;
  'game:submitResponse': (payload: { promptId: string; choiceId: string }) => void;
  'game:useSkill': (payload: { skillId: string }) => void;
  'game:rendeGive': (payload: {
    targetId: string;
    cards: string[];
    handIndices?: number[];
  }) => void;
  'game:rendeFinish': () => void;
  'game:qingnangRecover': (payload: { targetId: string; handIndex?: number; handIndices?: number[] }) => void;
  'game:zhihengConfirm': (payload: { handIndices: number[] }) => void;
  'game:modifyJudge': (payload: { promptId: string; handIndex: number }) => void;
  'game:skipModifyJudge': (payload: { promptId: string }) => void;
  'game:discardCards': (payload: { promptId: string; handIndices: number[] }) => void;
  'game:cancelDiscard': (payload: { promptId: string }) => void;
  'game:selectZoneCard': (payload: { promptId: string; choiceId: string }) => void;
  'game:endTurn': () => void;
  'game:sync': (ack?: (room: Room | null) => void) => void;
  'monopoly:roll': () => void;
  'monopoly:buy': () => void;
  'monopoly:upgrade': () => void;
  'monopoly:skip': () => void;
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
  'room:disbanded': (payload: { roomId: string; code: string; _v: 1 }) => void;
  'room.lifecycle.state_changed': (payload: {
    roomId: string;
    lifecycle: RoomLifecycleState;
    hostId: string;
    _v: 1;
  }) => void;
  'chat:message': (message: ChatMessage) => void;
  'game:started': (payload: { roomId: string }) => void;
  'game:finished': (payload: { roomId: string; victory: { winners: string[]; message: string } }) => void;
  'game:event': (payload: { type: string; message: string }) => void;
  'user:nicknameChanged': (payload: { userId: string; nickname: string; _v: 1 }) => void;
  'user:walletChanged': (payload: {
    coins: number;
    experience: number;
    level: number;
    reason?: string;
    _v: 1;
  }) => void;
  'sandbox:actor': (payload: { actingPlayerId: string }) => void;
}

export interface PlayerPublicProfile {
  userId: string;
  nickname: string;
  level: number;
  coins: number;
  stats: GameStats;
  statsByGame?: Record<GameStatsKey, GameStats>;
  updatedAt: number;
  _v: 1;
}

export type LianliankanDisplayMode = 'emoji' | 'text';
export type LianliankanDifficultyId = 'easy' | 'normal' | 'hard';
export type LianliankanSessionStatus = 'playing' | 'won' | 'lost' | 'expired';

export interface LianliankanThemeItem {
  id: string;
  text: string;
  emoji: string;
  similarGroup?: string;
}

export interface LianliankanTheme {
  themeId: string;
  name: string;
  items: LianliankanThemeItem[];
  similarGroups: Array<{ groupId: string; itemIds: string[] }>;
}

export interface LianliankanDifficulty {
  difficultyId: LianliankanDifficultyId;
  name: string;
  rows: number;
  cols: number;
  kindCount: number;
  timeLimitSec: number;
  entryFee: number;
  rewardCoins: number;
  similarGroupWeight: number;
}

export interface LianliankanConfig {
  themes: LianliankanTheme[];
  difficulties: LianliankanDifficulty[];
  defaultThemeId: string;
  defaultDifficultyId: LianliankanDifficultyId;
  _v: 1;
}

export interface LianliankanTile {
  tileId: string;
  itemId: string;
  row: number;
  col: number;
}

export interface LianliankanSession {
  sessionId: string;
  mode: 'solo' | 'race';
  roomId?: string;
  themeId: string;
  difficultyId: LianliankanDifficultyId;
  status: LianliankanSessionStatus;
  rows: number;
  cols: number;
  timeLimitSec: number;
  entryFee: number;
  rewardCoins: number;
  startedAt: number;
  deadlineAt: number;
  finishedAt?: number;
  board: LianliankanTile[];
  _v: 1;
}

export type RoomCreateAck =
  | { ok: true; room: Room; playerId: string }
  | { ok: false; error: string; code?: string };

export type RoomJoinAck =
  | { ok: true; room: Room; playerId: string }
  | { ok: false; error: string; code?: string };

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

export * from './versions';
