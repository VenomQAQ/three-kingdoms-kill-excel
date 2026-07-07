import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmLogout } from './logout';

describe('confirmLogout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns about coin penalty when in an active game', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const ok = confirmLogout({ status: 'playing', code: '123456' });
    expect(ok).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      '当前正在游戏中，退出登录将离开房间并扣除 5 金币（最低扣至 0）。确认退出登录？',
    );
  });

  it('asks for a normal confirmation when not in an active game', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const ok = confirmLogout({ status: 'waiting', code: '123456' });
    expect(ok).toBe(false);
    expect(confirm).toHaveBeenCalledWith('确认退出登录？');
  });

  it('asks for a normal confirmation when there is no room', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(confirmLogout(null)).toBe(true);
    expect(confirm).toHaveBeenCalledWith('确认退出登录？');
  });
});
