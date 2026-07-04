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

const nodeEnv = process.env.NODE_ENV ?? 'development';

// REQ-2026-001 · blocking-1 · 生产环境必须显式设置 JWT_ACCESS_SECRET
const DEV_JWT_FALLBACK = 'dev-insecure-secret-change-me';
const rawJwtSecret = process.env.JWT_ACCESS_SECRET;
if (nodeEnv === 'production' && !rawJwtSecret) {
  // 立即抛错，避免用硬编码 fallback（可伪造 token）
  throw new Error(
    '[env] JWT_ACCESS_SECRET must be set in production. Refusing to start with default secret.',
  );
}
if (!rawJwtSecret) {
  // dev 环境保留 fallback，但打印明显警告
  // eslint-disable-next-line no-console
  console.warn(
    `[env] ⚠ JWT_ACCESS_SECRET not set, using insecure dev fallback. Do NOT deploy this build to production.`,
  );
}

export const env = Object.freeze({
  nodeEnv,

  port: int(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5052,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // 存储
  sqlitePath: process.env.SQLITE_PATH ?? 'data/app.sqlite',

  // Auth
  jwtAccessSecret: rawJwtSecret ?? DEV_JWT_FALLBACK,
  jwtAccessTtlSec: int(process.env.JWT_ACCESS_TTL_SEC, 3600),
  refreshTtlSec: int(process.env.REFRESH_TTL_SEC, 60 * 60 * 24 * 7),
  reconnectGraceSec: int(process.env.RECONNECT_GRACE_SEC, 300),
  selectingTimeoutSec: int(process.env.SELECTING_TIMEOUT_SEC, 180),

  // Cookie
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // 环境开关
  sandboxEnabled: bool(process.env.SANDBOX_ENABLED, false),
  debugClockEnabled: bool(process.env.ENABLE_DEBUG_CLOCK, false),
});

export type EnvConfig = typeof env;
