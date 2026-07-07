import { SANDBOX_ROOM_CODE } from '../data/decoy';

/** 退出登录前确认：游戏中提示扣费，其它情况普通确认 */
export function confirmLogout(room: { isSandbox?: boolean; code?: string; status?: string } | null): boolean {
  if (typeof window === 'undefined') return true;
  const inActiveGame =
    room &&
    !room.isSandbox &&
    room.code !== SANDBOX_ROOM_CODE &&
    (room.status === 'selecting' || room.status === 'playing');
  if (inActiveGame) {
    return window.confirm(
      '当前正在游戏中，退出登录将离开房间并扣除 5 金币（最低扣至 0）。确认退出登录？',
    );
  }
  return window.confirm('确认退出登录？');
}
