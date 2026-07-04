/**
 * 三国杀版本目录（REQ-2026-001）
 * 后续新增版本只需追加此数组 + 后端 server 侧 build/restart。
 * 前端通过 GET /api/capabilities 获得该列表。
 */
export interface GameVersion {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  default: boolean;
}

export const VERSIONS: readonly GameVersion[] = Object.freeze([
  {
    id: 'standard-2014',
    name: '三国杀标准版·界限突破',
    minPlayers: 2,
    maxPlayers: 8,
    default: true,
  },
]);

export const DEFAULT_VERSION_ID = 'standard-2014';

export function findVersion(id: string): GameVersion | undefined {
  return VERSIONS.find((v) => v.id === id);
}
