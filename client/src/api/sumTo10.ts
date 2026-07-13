import type { SumTo10Config, SumTo10Session, SumTo10SessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateSumTo10SessionResult {
  session: SumTo10Session;
  wallet: WalletView;
  _v: 1;
}

export interface FinishSumTo10SessionResult {
  sessionId: string;
  status: SumTo10SessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const SumTo10Api = {
  getConfig: () => httpGet<SumTo10Config>('/api/sum-to-10/config'),
  createSession: (input: { difficultyId: string }) =>
    httpPost<CreateSumTo10SessionResult>('/api/sum-to-10/sessions', input),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; clientFinishedAt: number; score: number },
  ) =>
    httpPost<FinishSumTo10SessionResult>(
      `/api/sum-to-10/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
