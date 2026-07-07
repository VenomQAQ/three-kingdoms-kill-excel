export interface BossKeyShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

export const DEFAULT_BOSS_KEY: BossKeyShortcut = {
  ctrl: true,
  shift: true,
  alt: false,
  meta: false,
  key: 'H',
};

const STORAGE_KEY = 'tk_boss_key_shortcut';

export function formatBossKeyShortcut(shortcut: BossKeyShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.meta) parts.push('Cmd');
  parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return parts.join('+');
}

export function loadBossKeyShortcut(): BossKeyShortcut {
  if (typeof window === 'undefined') return { ...DEFAULT_BOSS_KEY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOSS_KEY };
    const parsed = JSON.parse(raw) as Partial<BossKeyShortcut>;
    if (!parsed.key || typeof parsed.key !== 'string') return { ...DEFAULT_BOSS_KEY };
    return {
      ctrl: !!parsed.ctrl,
      shift: !!parsed.shift,
      alt: !!parsed.alt,
      meta: !!parsed.meta,
      key: parsed.key,
    };
  } catch {
    return { ...DEFAULT_BOSS_KEY };
  }
}

export function saveBossKeyShortcut(shortcut: BossKeyShortcut): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcut));
}

export function matchesBossKeyShortcut(event: KeyboardEvent, shortcut: BossKeyShortcut): boolean {
  if (event.ctrlKey !== shortcut.ctrl) return false;
  if (event.shiftKey !== shortcut.shift) return false;
  if (event.altKey !== shortcut.alt) return false;
  if (event.metaKey !== shortcut.meta) return false;
  const pressed = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const target = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  return pressed === target;
}

export function bossKeyFromKeyboardEvent(event: KeyboardEvent): BossKeyShortcut | null {
  if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
    return null;
  }
  return {
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
  };
}
