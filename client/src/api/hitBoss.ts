import type { HitBossConfig, HitBossSession, HitBossSessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateHitBossSessionResult {
  session: HitBossSession;
  wallet: WalletView;
  _v: 1;
}

export interface ExtendHitBossSessionResult {
  session: HitBossSession;
  wallet: WalletView;
  extendFee: number;
  extendSec: number;
  _v: 1;
}

export interface FinishHitBossSessionResult {
  sessionId: string;
  status: HitBossSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const HitBossApi = {
  getConfig: () => httpGet<HitBossConfig>('/api/hit-boss/config'),
  createSession: (input: { difficultyId: string }) =>
    httpPost<CreateHitBossSessionResult>('/api/hit-boss/sessions', input),
  extendSession: (sessionId: string) =>
    httpPost<ExtendHitBossSessionResult>(
      `/api/hit-boss/sessions/${encodeURIComponent(sessionId)}/extend`,
      {},
    ),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; bossesHit: number; missHits: number },
  ) =>
    httpPost<FinishHitBossSessionResult>(
      `/api/hit-boss/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
