import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOSS_KEY_ACTION,
  loadBossKeyAction,
  saveBossKeyAction,
} from './bossKeyConfig';

describe('bossKeyConfig', () => {
  it('defaults to regional sales and persists custom action', () => {
    window.localStorage.clear();
    expect(loadBossKeyAction()).toBe(DEFAULT_BOSS_KEY_ACTION);

    saveBossKeyAction('custom-image');
    expect(loadBossKeyAction()).toBe('custom-image');

    saveBossKeyAction('regional-sales');
    expect(loadBossKeyAction()).toBe('regional-sales');
  });

  it('falls back to default for invalid stored value', () => {
    window.localStorage.setItem('tk_boss_key_action', 'invalid');
    expect(loadBossKeyAction()).toBe(DEFAULT_BOSS_KEY_ACTION);
  });
});
