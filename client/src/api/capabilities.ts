/**
 * REQ-2026-001 · FE-1 · Capabilities API
 * 对齐 design/api-contract.v1.md §2.1
 */
import { httpGet } from './http';

export interface VersionInfo {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  default: boolean;
}

export interface ChatLimits {
  ratePerSec: number;
  maxLength: number;
  historySize: number;
  snapshotSize: number;
}

export interface SessionInfo {
  accessTtlSec: number;
  refreshTtlSec: number;
  reconnectGraceSec: number;
}

export interface Capabilities {
  sandboxEnabled: boolean;
  versions: VersionInfo[];
  bgColorToken: string;
  selectingTimeoutSec: number;
  chatLimits: ChatLimits;
  session: SessionInfo;
}

export interface VersionDetail {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  generals: Array<{
    id: string;
    name: string;
    kingdom: 'wei' | 'shu' | 'wu' | 'qun';
    hp: number;
  }>;
  cards: {
    basic: string[];
    trick: string[];
    equipment: string[];
  };
  unlockHint: string;
  readOnly: true;
  _v: 1;
}

export const CapabilitiesApi = {
  get: () => httpGet<Capabilities>('/api/capabilities'),
  getVersionDetail: (versionId: string) =>
    httpGet<VersionDetail>(`/api/versions/${encodeURIComponent(versionId)}`),
};
