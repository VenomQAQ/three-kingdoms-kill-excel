export type BossKeyAction = 'regional-sales' | 'custom-image';

const STORAGE_KEY = 'tk_boss_key_action';
export const DEFAULT_BOSS_KEY_ACTION: BossKeyAction = 'regional-sales';

export function loadBossKeyAction(): BossKeyAction {
  if (typeof window === 'undefined') return DEFAULT_BOSS_KEY_ACTION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'custom-image' || raw === 'regional-sales') return raw;
    return DEFAULT_BOSS_KEY_ACTION;
  } catch {
    return DEFAULT_BOSS_KEY_ACTION;
  }
}

export function saveBossKeyAction(action: BossKeyAction): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, action);
}
