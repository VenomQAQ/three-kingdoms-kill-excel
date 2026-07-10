import type {
  CrimeSudokuConfig,
  CrimeSudokuProgressView,
} from '@tk/shared';
import { httpGet, httpPost } from './http';
import type { WalletView } from './lianliankan';

export interface CrimeSudokuClaimResult {
  levelId: string;
  rewardCoins: number;
  clearTimeMs: number;
  alreadyClaimed: boolean;
  wallet: WalletView;
  _v: 1;
}

export interface CrimeSudokuHintResult {
  levelId: string;
  hintCost: number;
  hintsUsed: number;
  maxHints: number;
  wallet: WalletView;
  _v: 1;
}

export const CrimeSudokuApi = {
  getConfig: () => httpGet<CrimeSudokuConfig>('/api/crime-sudoku/config'),
  getProgress: () => httpGet<CrimeSudokuProgressView>('/api/crime-sudoku/progress'),
  claimClear: (input: { levelId: string; clearTimeMs: number }) =>
    httpPost<CrimeSudokuClaimResult>('/api/crime-sudoku/claim', input, {
      retries: 3,
      retryDelayMs: 600,
    }),
  useHint: (input: { levelId: string; hintsUsedBefore: number }) =>
    httpPost<CrimeSudokuHintResult>('/api/crime-sudoku/hint', input),
};
