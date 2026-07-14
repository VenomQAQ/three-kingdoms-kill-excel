import type { NonogramConfig, NonogramSession, NonogramSessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateNonogramSessionResult {
  session: NonogramSession;
  wallet: WalletView;
  _v: 1;
}

export interface FinishNonogramSessionResult {
  sessionId: string;
  status: NonogramSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const NonogramApi = {
  getConfig: () => httpGet<NonogramConfig>('/api/nonogram/config'),
  createSession: (input: { difficultyId: string }) =>
    httpPost<CreateNonogramSessionResult>('/api/nonogram/sessions', input),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; board?: boolean[][]; mistakes?: number; clientFinishedAt: number },
  ) =>
    httpPost<FinishNonogramSessionResult>(
      `/api/nonogram/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
