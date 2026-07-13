import type { CardFlipConfig, CardFlipSession, CardFlipSessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateCardFlipSessionResult {
  session: CardFlipSession;
  wallet: WalletView;
  _v: 1;
}

export interface FinishCardFlipSessionResult {
  sessionId: string;
  status: CardFlipSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const CardFlipApi = {
  getConfig: () => httpGet<CardFlipConfig>('/api/card-flip/config'),
  createSession: (input: { themeId: string; difficultyId: string }) =>
    httpPost<CreateCardFlipSessionResult>('/api/card-flip/sessions', input),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; clientFinishedAt: number; remainingTiles: number },
  ) =>
    httpPost<FinishCardFlipSessionResult>(
      `/api/card-flip/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
