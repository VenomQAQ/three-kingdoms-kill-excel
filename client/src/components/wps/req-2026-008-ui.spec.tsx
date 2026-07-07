import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Room } from '@tk/shared';
import { DEFAULT_BOSS_KEY, formatBossKeyShortcut } from '../../utils/bossKey';
import { DEFAULT_BOSS_KEY_ACTION } from '../../utils/bossKeyConfig';
import { MonopolyGrid } from './MonopolyGrid';
import { SettingsDialog } from './SettingsDialog';

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: { user: { email: string } | null }) => unknown) =>
    selector({ user: { email: '12345@qq.com' } }),
}));

function htmlOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const monopolyRoom: Room = {
  id: 'room-monopoly',
  code: '87654321',
  hostId: 'p1',
  maxPlayers: 8,
  versionName: '中国版大富翁',
  players: [
    { id: 'p1', userId: 'u1', nickname: '房主', ready: true, connected: true },
    { id: 'p2', userId: 'u2', nickname: '玩家二', ready: true, connected: false },
  ],
  status: 'playing',
  settings: { maxPlayers: 8 },
  createdAt: Date.now(),
  gameType: 'monopoly',
  monopoly: {
    phase: 'playing',
    turnIndex: 0,
    round: 2,
    pendingAction: null,
    board: Array.from({ length: 40 }, (_, index) => {
      const fallback = { index, name: `格子${index}`, country: '世界', type: 'rest' as const, price: 0, rent: 0 };
      if (index === 0) return { index, name: '起点', country: '世界', type: 'start' as const, price: 2000, displayPrice: 2000, rent: 0 };
      if (index === 1) return { index, name: '苏州', country: '华东', type: 'city' as const, price: 3200, displayPrice: 3200, rent: 420, level: 1, colorGroup: 'green' };
      if (index === 15) return { index, name: '沈阳火车站', country: '交通', type: 'rail' as const, price: 2000, displayPrice: 2000, rent: 320, ownerId: 'p2' };
      return fallback;
    }),
    players: [
      { playerId: 'p1', nickname: '房主', position: 1, cash: 15000, properties: [] },
      { playerId: 'p2', nickname: '玩家二', position: 15, cash: 13000, properties: [15] },
    ],
    log: ['房主 抽到：前往最近的火车站，若有主人付双倍租金；无人拥有可购买'],
  },
};

describe('REQ-2026-008 UI acceptance', () => {
  it('renders monopoly toolbar without current player, dice and drawn card text', () => {
    const html = htmlOf(
      <MonopolyGrid
        room={monopolyRoom}
        playerId="p1"
        selectedCell="A2"
        showCellColors={false}
        onShowCellColorsChange={vi.fn()}
        onSelectCell={vi.fn()}
        onRoll={vi.fn()}
        onBuy={vi.fn()}
        onUpgrade={vi.fn()}
        onSkip={vi.fn()}
        chatMessages={[]}
        onSendChat={vi.fn()}
      />,
    );

    expect(html).toContain('回合 2');
    expect(html).toContain('显示地块颜色');
    expect(html).not.toContain('当前：');
    expect(html).not.toContain('骰子：');
    expect(html).not.toContain('机会：');
    expect(html).toContain('抽到：前往最近的火车站');
  });

  it('renders simplified player assets table with online dot and no profile/status columns', () => {
    const html = htmlOf(
      <MonopolyGrid
        room={monopolyRoom}
        playerId="p1"
        selectedCell="A2"
        onSelectCell={vi.fn()}
        onRoll={vi.fn()}
        onBuy={vi.fn()}
        onUpgrade={vi.fn()}
        onSkip={vi.fn()}
        chatMessages={[]}
        onSendChat={vi.fn()}
      />,
    );

    expect(html).toContain('玩家');
    expect(html).toContain('现金');
    expect(html).toContain('位置');
    expect(html).not.toContain('资料');
    expect(html).not.toContain('状态');
    expect(html).not.toContain('查看');
    expect(html).toContain('房主');
    expect(html).toContain('玩家二');
  });

  it('renders settings dialog with boss key shortcut config instead of cell color toggle', () => {
    const html = htmlOf(
      <SettingsDialog
        open
        defaultGameType="monopoly"
        onDefaultGameTypeChange={vi.fn()}
        bossKeyShortcut={DEFAULT_BOSS_KEY}
        onBossKeyShortcutChange={vi.fn()}
        bossKeyAction={DEFAULT_BOSS_KEY_ACTION}
        onBossKeyActionChange={vi.fn()}
        bgColorToken="#ffffff"
        onBgColorTokenChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('老板键');
    expect(html).toContain('区域销售');
    expect(html).toContain('自定义图片');
    expect(html).toContain('上传规格');
    expect(html).toContain(formatBossKeyShortcut(DEFAULT_BOSS_KEY));
    expect(html).not.toContain('隐藏地块颜色');
    expect(html).not.toContain('常规模式');
  });

  it('renders change password dialog with qq email field', async () => {
    const { ChangePasswordDialog } = await import('./ChangePasswordDialog');
    const html = htmlOf(
      <ChangePasswordDialog open onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain('QQ 邮箱');
    expect(html).toContain('旧密码');
    expect(html).toContain('确认新密码');
    expect(html).toContain('保存');
  });
});
