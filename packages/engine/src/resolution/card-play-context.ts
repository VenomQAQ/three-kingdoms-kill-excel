/** 挂在 state.resolution.context.cardPlay 上的用牌结算上下文 */
export interface CardPlayContext {
  cardId: string;
  sourcePlayerId: string;
  handIndex?: number;
  targetPlayerIds: string[];
  responseType?: string;
  responsesRequired: number;
  responseCount: number;
  awaitingResponseFrom?: string;
  /** AOE 未响应造成伤害后，待 reactive 技能处理完再推进下一目标 */
  pendingAoeAdvance?: boolean;
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

/** 过河拆桥 / 顺手牵羊等待选区域牌 */
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

/** 受伤后待发动的主动技（奸雄等） */
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
