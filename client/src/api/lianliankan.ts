import type { LianliankanConfig, LianliankanSession, LianliankanSessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';

export interface WalletView {
  coins: number;
  experience: number;
  level: number;
}

export interface CreateLianliankanSessionResult {
  session: LianliankanSession;
  wallet: WalletView;
  _v: 1;
}

export interface FinishLianliankanSessionResult {
  sessionId: string;
  status: LianliankanSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const LianliankanApi = {
  getConfig: () => httpGet<LianliankanConfig>('/api/lianliankan/config'),
  createSession: (input: { themeId: string; difficultyId: string; mode?: 'solo' | 'race' }) =>
    httpPost<CreateLianliankanSessionResult>('/api/lianliankan/sessions', input),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; clientFinishedAt: number; remainingTiles: number },
  ) => httpPost<FinishLianliankanSessionResult>(`/api/lianliankan/sessions/${encodeURIComponent(sessionId)}/finish`, input),
};
