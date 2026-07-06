import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Room, RoomListItem } from '@tk/shared';
import { LIANLIANKAN_CONFIG } from '../../../../server/src/modules/lianliankan/lianliankan.config';
import { InfoBar } from './InfoBar';
import { MonopolyGrid } from './MonopolyGrid';
import { Ribbon } from './Ribbon';
import { RoomListGrid } from './RoomListGrid';
import { SettingsDialog } from './SettingsDialog';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

function htmlOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const monopolyRoom: Room = {
  id: 'room-monopoly',
  code: '87654321',
  hostId: 'p1',
  maxPlayers: 4,
  versionName: '世界版大富翁',
  players: [
    { id: 'p1', userId: 'u1', nickname: '房主', ready: true, connected: true },
    { id: 'p2', userId: 'u2', nickname: '玩家二', ready: true, connected: true },
  ],
  status: 'playing',
  settings: { maxPlayers: 4 },
  createdAt: Date.now(),
  gameType: 'monopoly',
  monopoly: {
    phase: 'playing',
    turnIndex: 0,
    round: 1,
    lastDice: [1, 2],
    pendingAction: 'buy_or_skip',
    board: [
      { index: 0, name: '起点', country: '世界', type: 'start', price: 0, rent: 0 },
      { index: 1, name: '北京', country: '中国', type: 'city', price: 120, rent: 18 },
      { index: 2, name: '机会', country: '亚洲', type: 'chance', price: 0, rent: 0 },
      { index: 3, name: '东京', country: '日本', type: 'city', price: 140, rent: 22, ownerId: 'p2' },
    ],
    players: [
      { playerId: 'p1', nickname: '房主', position: 1, cash: 1500, properties: [] },
      { playerId: 'p2', nickname: '玩家二', position: 3, cash: 1500, properties: [3] },
    ],
    log: ['世界版大富翁开始，游玩免费。'],
  },
};

describe('REQ-2026-006 UI acceptance', () => {
  it('moves account wallet information into the info bar and removes connection wording', () => {
    const html = htmlOf(
      <InfoBar
        nickname="阿斗"
        connected
        accountLabel="Lv.3 阿斗 · 88金币"
        isAuthed
        onProfileClick={vi.fn()}
      />,
    );

    expect(html).toContain('Lv.3 阿斗 · 88金币');
    expect(html).toContain('当前状态');
    expect(html).toContain('在线');
    expect(html).not.toContain('已登录');
    expect(html).not.toContain('连接：已连接');
    expect(html).not.toContain('已连接');
  });

  it('keeps the spreadsheet status bar free of socket connection copy', () => {
    const html = htmlOf(<StatusBar connected roomCode="87654321" playerCount={2} />);

    expect(html).toContain('就绪');
    expect(html).toContain('87654321');
    expect(html).not.toContain('已连接');
    expect(html).not.toContain('未连接');
  });

  it('renames paste-style toolbar entry to settings', () => {
    const toolbarHtml = htmlOf(<Toolbar />);
    const ribbonHtml = htmlOf(<Ribbon actions={[]} onAction={vi.fn()} versions={[]} />);

    expect(toolbarHtml).toContain('设置');
    expect(ribbonHtml).toContain('设置');
    expect(toolbarHtml).not.toContain('粘贴');
    expect(ribbonHtml).not.toContain('粘贴');
  });

  it('renders settings dialog with nickname, password and browser title settings', () => {
    const html = htmlOf(
      <SettingsDialog
        open
        defaultGameType="monopoly"
        onDefaultGameTypeChange={vi.fn()}
        onChangeNickname={vi.fn()}
        onChangePassword={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('修改昵称');
    expect(html).toContain('修改密码');
    expect(html).toContain('浏览器标签页标题');
    expect(html).toContain('大富翁');
  });

  it('adjusts lianliankan difficulty sizes and adds richer themes', () => {
    expect(LIANLIANKAN_CONFIG.difficulties.map((item) => [item.difficultyId, item.rows, item.cols])).toEqual([
      ['easy', 8, 8],
      ['normal', 10, 10],
      ['hard', 12, 12],
    ]);
    expect(LIANLIANKAN_CONFIG.themes.map((item) => item.name)).toEqual(
      expect.arrayContaining(['颜文字', 'Emoji表情']),
    );
  });

  it('lets the room list create and display world monopoly rooms', () => {
    const rooms: RoomListItem[] = [
      {
        code: '87654321',
        status: 'waiting',
        playerCount: 2,
        maxPlayers: 4,
        ownerNickname: '房主',
        versionName: '世界版大富翁',
        gameType: 'monopoly',
        gameName: '世界版大富翁',
        joinLabel: '加入',
        _v: 1,
      },
    ];
    const html = htmlOf(
      <RoomListGrid
        rooms={rooms}
        defaultGameType="monopoly"
        selectedCell="A1"
        onSelectCell={vi.fn()}
        onJoinRoom={vi.fn()}
      />,
    );

    expect(html).toContain('创建类型');
    expect(html).toContain('大富翁');
    expect(html).toContain('世界版大富翁');
    expect(html).toContain('2/4');
  });

  it('renders the world monopoly game as spreadsheet cells with free-play log', () => {
    const html = htmlOf(
      <MonopolyGrid
        room={monopolyRoom}
        playerId="p1"
        selectedCell="A2"
        onSelectCell={vi.fn()}
        onRoll={vi.fn()}
        onBuy={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(html).toContain('北京');
    expect(html).toContain('东京');
    expect(html).toContain('玩家资产');
    expect(html).toContain('购买');
    expect(html).toContain('游玩免费');
  });
});
