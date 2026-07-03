/**
 * 集中管理环境变量（backend-tech-design.v1 §1.3）
 * 只读、启动时快照；启动后不允许再变。
 */

const bool = (v: string | undefined, def: boolean): boolean => {
  if (v === undefined || v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
};

const int = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',

  port: int(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5052,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // 存储
  sqlitePath: process.env.SQLITE_PATH ?? 'data/app.sqlite',

  // Auth
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-insecure-secret-change-me',
  jwtAccessTtlSec: int(process.env.JWT_ACCESS_TTL_SEC, 3600),
  refreshTtlSec: int(process.env.REFRESH_TTL_SEC, 60 * 60 * 24 * 7),
  reconnectGraceSec: int(process.env.RECONNECT_GRACE_SEC, 300),

  // Cookie
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // 环境开关
  sandboxEnabled: bool(process.env.SANDBOX_ENABLED, false),
  debugClockEnabled: bool(process.env.ENABLE_DEBUG_CLOCK, false),
});

export type EnvConfig = typeof env;
