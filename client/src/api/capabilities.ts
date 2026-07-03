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
  chatLimits: ChatLimits;
  session: SessionInfo;
}

export const CapabilitiesApi = {
  get: () => httpGet<Capabilities>('/api/capabilities'),
};
