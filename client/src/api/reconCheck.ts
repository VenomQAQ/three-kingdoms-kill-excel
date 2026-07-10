import type {
  ReconCheckConfig,
  ReconCheckFinishInput,
  ReconCheckSession,
  ReconCheckSessionStatus,
} from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateReconCheckSessionResult {
  session: ReconCheckSession;
  wallet: WalletView;
  _v: 1;
}

export interface ExtendReconCheckSessionResult {
  session: ReconCheckSession;
  wallet: WalletView;
  extendFee: number;
  extendSec: number;
  _v: 1;
}

export interface FinishReconCheckSessionResult {
  sessionId: string;
  status: ReconCheckSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const ReconCheckApi = {
  getConfig: () => httpGet<ReconCheckConfig>('/api/recon-check/config'),
  createSession: (input: { difficultyId: string }) =>
    httpPost<CreateReconCheckSessionResult>('/api/recon-check/sessions', input),
  extendSession: (sessionId: string) =>
    httpPost<ExtendReconCheckSessionResult>(
      `/api/recon-check/sessions/${encodeURIComponent(sessionId)}/extend`,
      {},
    ),
  finishSession: (sessionId: string, input: ReconCheckFinishInput & { result: 'won' | 'lost' }) =>
    httpPost<FinishReconCheckSessionResult>(
      `/api/recon-check/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
