export interface CardPlayContext {
  cardId: string;
  sourcePlayerId: string;
  handIndex?: number;
  targetPlayerIds: string[];
  isAoe?: boolean;
  responseType?: string;
  responsesRequired: number;
  responseCount: number;
  awaitingResponseFrom?: string;
  wuxieQueue?: string[];
  awaitingWuxieFrom?: string;
  wuxiePromptSourcePlayerId?: string;
  wuxieCancelledTargetIds?: string[];
  wuxieCancelledAll?: boolean;
  pendingAoeAdvance?: boolean;
  /** 锦囊已从手牌打出（用于延迟消耗：选区域牌前取消可保留手牌） */
  cardCommitted?: boolean;
  /** 选目标时一并提交的区域牌（合并确认） */
  pendingZoneCardId?: string;
}

export const CARD_PLAY_CTX_KEY = 'cardPlay';

export function getCardPlayContext(
  context: Record<string, unknown>,
): CardPlayContext | undefined {
  return context[CARD_PLAY_CTX_KEY] as CardPlayContext | undefined;
}

export function setCardPlayContext(
  context: Record<string, unknown>,
  value: CardPlayContext | undefined,
): void {
  if (value) context[CARD_PLAY_CTX_KEY] = value;
  else delete context[CARD_PLAY_CTX_KEY];
}

export interface PendingZonePick {
  action: 'discard' | 'take';
  sourcePlayerId: string;
  targetPlayerId: string;
}

export const ZONE_PICK_CTX_KEY = 'zonePick';

export function getZonePickContext(
  context: Record<string, unknown>,
): PendingZonePick | undefined {
  return context[ZONE_PICK_CTX_KEY] as PendingZonePick | undefined;
}

export function setZonePickContext(
  context: Record<string, unknown>,
  value: PendingZonePick | undefined,
): void {
  if (value) context[ZONE_PICK_CTX_KEY] = value;
  else delete context[ZONE_PICK_CTX_KEY];
}

export interface PendingReactiveSkill {
  eventId: string;
  playerId: string;
  skillId: string;
}

export const PENDING_REACTIVE_KEY = 'pendingReactive';

export function getPendingReactive(
  context: Record<string, unknown>,
): PendingReactiveSkill | undefined {
  return context[PENDING_REACTIVE_KEY] as PendingReactiveSkill | undefined;
}

export function setPendingReactive(
  context: Record<string, unknown>,
  value: PendingReactiveSkill | undefined,
): void {
  if (value) context[PENDING_REACTIVE_KEY] = value;
  else delete context[PENDING_REACTIVE_KEY];
}

export interface DyingRescueContext {
  dyingPlayerId: string;
  queue: string[];
  index: number;
}

export const DYING_RESCUE_CTX_KEY = 'dyingRescue';

export function getDyingRescueContext(
  context: Record<string, unknown>,
): DyingRescueContext | undefined {
  return context[DYING_RESCUE_CTX_KEY] as DyingRescueContext | undefined;
}

export function setDyingRescueContext(
  context: Record<string, unknown>,
  value: DyingRescueContext | undefined,
): void {
  if (value) context[DYING_RESCUE_CTX_KEY] = value;
  else delete context[DYING_RESCUE_CTX_KEY];
}
