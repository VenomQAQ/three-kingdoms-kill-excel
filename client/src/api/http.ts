/**
 * REQ-2026-001 · FE-1 · 前端 HTTP 客户端封装
 *
 * 契约参考 design/api-contract.v1.md：
 *   - 所有请求走同源代理（/api/...），credentials: 'include' 让 Cookie 自动带
 *   - 401 时自动尝试 POST /api/auth/refresh 一次；再失败抛出，由调用方处理
 *   - 错误响应形状：{ ok:false, code, message, _v:1 }
 *   - 成功响应形状：{ ok:true, data, _v:1 } 或 { ok:true, _v:1 }
 */

export interface ApiSuccess<T = unknown> {
  ok: true;
  data?: T;
  _v: 1;
}
export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
  _v: 1;
}
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

export class HttpError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const REFRESH_URL = '/api/auth/refresh';

// 单飞 refresh：并发多请求同时命中 401，共用同一次 refresh
let inflightRefresh: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = fetch(REFRESH_URL, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        inflightRefresh = null;
      });
  }
  return inflightRefresh;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** 内部使用：是否已尝试过 refresh。避免死循环 */
  _retriedAfterRefresh?: boolean;
}

/**
 * 通用 JSON 请求。
 * 成功抛出 data；失败（含 401 refresh 失败）抛 HttpError。
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const url = path.startsWith('/') ? path : '/' + path;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify({ ...(opts.body as object), _v: 1 }),
  });

  // 401：尝试一次 refresh 再重放
  if (res.status === 401 && !opts._retriedAfterRefresh && path !== REFRESH_URL) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return apiFetch<T>(path, { ...opts, _retriedAfterRefresh: true });
    }
    // refresh 失败，继续走下面失败路径
  }

  // 尝试解析 JSON
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    // 没 JSON body（例如 5xx 兜底）
  }

  if (!res.ok || !payload || payload.ok === false) {
    const code = payload && payload.ok === false ? payload.code : `HTTP_${res.status}`;
    const msg = payload && payload.ok === false ? payload.message : `HTTP ${res.status}`;
    throw new HttpError(code, res.status, msg);
  }
  return (payload.data ?? undefined) as T;
}

/** 便捷别名 */
export const httpGet = <T = unknown>(p: string) => apiFetch<T>(p, { method: 'GET' });
export const httpPost = <T = unknown>(p: string, body?: unknown) =>
  apiFetch<T>(p, { method: 'POST', body });
export const httpPatch = <T = unknown>(p: string, body?: unknown) =>
  apiFetch<T>(p, { method: 'PATCH', body });
