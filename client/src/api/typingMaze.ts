import type { TypingMazeConfig, TypingMazeSession, TypingMazeSessionStatus } from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CreateTypingMazeSessionResult {
  session: TypingMazeSession;
  wallet: WalletView;
  _v: 1;
}

export interface ExtendTypingMazeSessionResult {
  session: TypingMazeSession;
  wallet: WalletView;
  extendFee: number;
  extendSec: number;
  _v: 1;
}

export interface FinishTypingMazeSessionResult {
  sessionId: string;
  status: TypingMazeSessionStatus;
  rewardCoins: number;
  wallet: WalletView;
  alreadySettled: boolean;
  _v: 1;
}

export const TypingMazeApi = {
  getConfig: () => httpGet<TypingMazeConfig>('/api/typing-maze/config'),
  createSession: (input: { modeId: string }) =>
    httpPost<CreateTypingMazeSessionResult>('/api/typing-maze/sessions', input),
  extendSession: (sessionId: string) =>
    httpPost<ExtendTypingMazeSessionResult>(
      `/api/typing-maze/sessions/${encodeURIComponent(sessionId)}/extend`,
      {},
    ),
  finishSession: (
    sessionId: string,
    input: { result: 'won' | 'lost'; clearedCount: number },
  ) =>
    httpPost<FinishTypingMazeSessionResult>(
      `/api/typing-maze/sessions/${encodeURIComponent(sessionId)}/finish`,
      input,
      { retries: 5, retryDelayMs: 800 },
    ),
};
