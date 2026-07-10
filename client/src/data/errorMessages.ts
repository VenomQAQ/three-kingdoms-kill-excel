/**
 * REQ-2026-001 · FE-10 · 契约错误码 → 中文提示
 * 对齐 design/api-contract.v1.md §0.4
 */

export const ERROR_MESSAGES: Record<string, string> = {
  E_UNAUTHORIZED: '请先登录',
  E_FORBIDDEN: '当前操作没有权限',
  E_BAD_CREDENTIALS: '邮箱或密码错误',
  E_USER_EXISTS: '该邮箱已注册',
  E_INVALID_EMAIL: '请使用 QQ 邮箱（数字@qq.com）',
  E_WEAK_PASSWORD: '密码需 8-32 位，且同时包含字母和数字',
  E_PASSWORD_MISMATCH: '原密码错误 / 两次输入不一致',
  E_INVALID_NICKNAME: '昵称长度需 2-12 字符，且不可包含 <>',
  E_NICKNAME_RATE_LIMIT: '昵称修改过于频繁，请稍后再试',
  E_REFRESH_EXPIRED: '登录已过期，请重新登录',
  E_REFRESH_REUSED: '登录状态异常，请重新登录',
  E_LOGIN_RATE_LIMIT: '登录尝试过于频繁，请稍后再试',
  E_CHECK_IN_ALREADY_DONE: '今天已经签到过了',
  E_ROOM_NOT_FOUND: '房间不存在',
  E_ROOM_FULL: '房间已满',
  E_ROOM_STARTED: '对局已开始，无法加入',
  E_ROOM_VERSION_MISMATCH: '房间版本与当前不一致',
  E_NOT_SELECTING: '当前不是选将阶段',
  E_NOT_YOUR_TURN: '当前不是你选将',
  E_INVALID_GENERAL_OPTION: '请选择候选武将',
  E_VERSION_UNKNOWN: '未知的三国杀版本',
  E_CHAT_RATE_LIMIT: '发送过快，请稍后再试',
  E_CHAT_TOO_LONG: '单条消息不能超过 200 字',
  E_CHAT_MUTED: '请先登录后发送',
  E_SANDBOX_DISABLED: '测试房未启用',
  E_WALLET_INSUFFICIENT_COINS: '金币不足',
  E_LLK_SESSION_NOT_FOUND: '本局已失效',
  E_LLK_SESSION_SETTLED: '本局已结束',
  E_LLK_SESSION_EXPIRED: '已超时',
  E_LLK_INVALID_CONFIG: '连连看配置不存在',
  E_LLK_REFRESH_USED: '本局已刷新过一次',
  E_LLK_REFRESH_INVALID_BOARD: '棋盘状态异常，无法刷新',
  E_HITBOSS_SESSION_NOT_FOUND: '本局已失效',
  E_HITBOSS_SESSION_SETTLED: '本局已结束',
  E_HITBOSS_SESSION_EXPIRED: '已超时',
  E_HITBOSS_INVALID_CONFIG: '打老板配置不存在',
  E_HITBOSS_EXTEND_LIMIT: '本局延长次数已用完',
  E_RECON_SESSION_NOT_FOUND: '本局已失效',
  E_RECON_SESSION_SETTLED: '本局已结束',
  E_RECON_SESSION_EXPIRED: '已超时',
  E_RECON_INVALID_CONFIG: '对账校验配置不存在',
  E_RECON_INVALID_RESULT: '差异核对结果无效',
  E_RECON_EXTEND_LIMIT: '本局延长次数已用完',
  E_INTERNAL: '服务开小差了，请稍后再试',
};

/**
 * 把错误码翻译成中文；无匹配时兜底。
 */
export function translateError(code: string | undefined | null, fallback = '发生了错误'): string {
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? fallback;
}
