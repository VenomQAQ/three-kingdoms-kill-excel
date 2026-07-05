/**
 * REQ-2026-001 · FE-1 · Auth 域 API
 * 对齐 design/api-contract.v1.md §1
 */
import { apiFetch, httpGet, httpPatch, httpPost } from './http';

export interface AuthUser {
  userId: string;
  email: string;
  nickname: string;
  preferredVersion: string;
  coins: number;
  experience: number;
  level: number;
}

export interface CheckInResult {
  coins: number;
  experience: number;
  level: number;
  reward: {
    coins: number;
    experience: number;
  };
}

export const AuthApi = {
  register: (email: string, password: string, nickname: string, confirmPassword = password) =>
    httpPost<AuthUser>('/api/auth/register', { email, password, confirmPassword, nickname }),

  login: (email: string, password: string) =>
    httpPost<AuthUser>('/api/auth/login', { email, password }),

  logout: () => httpPost<void>('/api/auth/logout'),

  changePassword: (oldPassword: string, newPassword: string) =>
    httpPost<void>('/api/auth/change-password', { oldPassword, newPassword }),

  updateProfile: (nickname: string) =>
    httpPatch<AuthUser>('/api/auth/profile', { nickname }),

  checkIn: () => httpPost<CheckInResult>('/api/auth/check-in'),

  /** 页面挂载/rehydrate 时调用；未登录抛 HttpError code=E_UNAUTHORIZED */
  me: () => httpGet<AuthUser>('/api/auth/me'),

  /**
   * 主动触发一次 refresh；一般无需手动调用，
   * apiFetch 已在 401 时自动 refresh 一次。
   */
  refresh: () => apiFetch<{ expiresIn: number }>('/api/auth/refresh', { method: 'POST' }),
};
