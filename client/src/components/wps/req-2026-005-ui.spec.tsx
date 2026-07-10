import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LianliankanConfig, LianliankanSession, LianliankanTile, Room, RoomListItem } from '@tk/shared';
import { formatChatTime } from '../../utils/chatTime';
import { canConnect, buildDemoBoard } from '../../utils/lianliankan';
import { LIANLIANKAN_SHEET_ID, ROOM_LIST_SHEET_ID, isSheetId } from '../../data/decoy';
import { BattleGrid } from './BattleGrid';
import { PlayerProfileModal } from './PlayerProfileModal';
import { LianliankanGrid } from './LianliankanGrid';
import { RoomListGrid } from './RoomListGrid';
import { SheetTabs } from './SheetTabs';
import { TitleBar } from './TitleBar';

function htmlOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const llkConfig: LianliankanConfig = {
  defaultThemeId: 'fruits',
  defaultDifficultyId: 'easy',
  themes: [
    {
      themeId: 'fruits',
      name: '果蔬',
      items: [
        { id: 'apple', text: '苹果', emoji: 'A' },
        { id: 'pear', text: '梨子', emoji: 'P' },
      ],
      similarGroups: [],
    },
  ],
  difficulties: [
    {
      difficultyId: 'easy',
      name: '简单',
      rows: 2,
      cols: 2,
      kindCount: 2,
      timeLimitSec: 180,
      entryFee: 5,
      rewardCoins: 8,
      similarGroupWeight: 0,
    },
  ],
  refreshFee: 5,
  _v: 1,
};

describe('REQ-2026-005 UI acceptance', () => {
  it('adds the lianliankan sheet entry', () => {
    const html = htmlOf(
      <SheetTabs active={ROOM_LIST_SHEET_ID} onSelect={vi.fn()} currentRoomDisabled />,
    );

    expect(html).toContain('房间列表');
    expect(html).toContain('当前房间');
    expect(html).toContain('连连看');
    expect(html).toContain('凶案数独');
    expect(html).toContain('区域销售');
  });

  it('adds the crime sudoku sheet entry', () => {
    const html = htmlOf(
      <SheetTabs active={ROOM_LIST_SHEET_ID} onSelect={vi.fn()} currentRoomDisabled />,
    );
    expect(html).toContain('凶案数独');
  });

  it('shows account level, nickname and coins in the title bar', () => {
    const html = htmlOf(
      <TitleBar
        fileName="连连看挑战.xlsx"
        accountLabel="Lv.3 阿斗 · 88金币"
        isAuthed
        onLogout={vi.fn()}
      />,
    );

    expect(html).toContain('连连看挑战.xlsx');
    expect(html).toContain('Lv.3 阿斗 · 88金币');
    expect(html).toContain('退出登录');
  });

  it('formats chat time by same-day and cross-day rules', () => {
    const now = new Date('2026-07-05T12:00:00+08:00').getTime();

    expect(formatChatTime(new Date('2026-07-05T09:08:00+08:00').getTime(), now)).toBe('09:08');
    expect(formatChatTime(new Date('2026-07-04T23:59:00+08:00').getTime(), now)).toBe('07-04 23:59');
  });

  it('exposes room owner profile through userId-backed room list cells', () => {
    const onViewProfile = vi.fn();
    const rooms: RoomListItem[] = [
      {
        code: '123456',
        status: 'waiting',
        playerCount: 1,
        maxPlayers: 8,
        ownerNickname: '房主A',
        ownerUserId: 'user-1',
        versionName: '三国杀标准版·界限突破',
        joinLabel: '加入',
        _v: 1,
      },
    ];
    const html = htmlOf(
      <RoomListGrid
        rooms={rooms}
        selectedCell="A1"
        onSelectCell={vi.fn()}
        onJoinRoom={vi.fn()}
        onViewProfile={onViewProfile}
      />,
    );

    expect(html).toContain('房主A');
  });

  it('renders lianliankan controls, wallet and display mode switch', () => {
    const session: LianliankanSession = {
      sessionId: 's1',
      mode: 'solo',
      themeId: 'fruits',
      difficultyId: 'easy',
      status: 'playing',
      rows: 2,
      cols: 2,
      timeLimitSec: 180,
      entryFee: 5,
      rewardCoins: 8,
      startedAt: Date.now(),
      deadlineAt: Date.now() + 120_000,
      refreshUsed: false,
      board: [
        { tileId: 'a1', itemId: 'apple', row: 0, col: 0 },
        { tileId: 'a2', itemId: 'apple', row: 0, col: 1 },
      ],
      _v: 1,
    };
    const html = htmlOf(
      <LianliankanGrid
        config={llkConfig}
        session={session}
        loading={false}
        settling={false}
        refreshing={false}
        selectedCell="A1"
        isAuthed
        coins={42}
        onSelectCell={vi.fn()}
        onStart={vi.fn()}
        onFinish={vi.fn()}
        onRefresh={vi.fn()}
        onRequireLogin={vi.fn()}
      />,
    );

    expect(html).toContain('主题');
    expect(html).toContain('难度');
    expect(html).toContain('图标');
    expect(html).toContain('文字');
    expect(html).toContain('当前余额：42');
    expect(html).toContain('通关奖励8金币');
    expect(html).toContain('刷新 · 5金币');
  });

  it('renders battle chat time and exposes virtual player profile entry', () => {
    const room: Room = {
      id: 'room-1',
      code: '12345678',
      hostId: 'p1',
      players: [
        {
          id: 'p1',
          nickname: '虚拟刘备',
          isVirtual: true,
          ready: true,
          connected: true,
          seat: 1,
          general: '界刘备',
          hp: 4,
          maxHp: 4,
          handCards: [],
          equipment: [],
          judgeCards: [],
        },
      ],
      maxPlayers: 8,
      status: 'playing',
      settings: { maxPlayers: 8 },
      createdAt: Date.now(),
      versionId: 'standard-2014',
      sandbox: {
        turnIndex: 0,
        round: 1,
        phase: 'playing',
        log: [],
      },
    };

    const html = htmlOf(
      <BattleGrid
        room={room}
        chatMessages={[
          {
            id: 'm1',
            roomId: 'room-1',
            playerId: 'p1',
            nickname: '虚拟刘备',
            content: '出牌',
            timestamp: new Date('2026-07-05T09:08:00+08:00').getTime(),
          },
        ]}
        playerId="p1"
        actingPlayerId="p1"
        selectedCell="A1"
        selectedHand={null}
        onSelectCell={vi.fn()}
        onSelectHand={vi.fn()}
        onPlayCard={vi.fn()}
        onViewSkills={vi.fn()}
        onViewProfile={vi.fn()}
        onViewCard={vi.fn()}
        onSendChat={vi.fn()}
      />,
    );

    expect(html).toContain('09:08');
    expect(html).toContain('刘备');
    expect(html).not.toContain('界刘备');
  });

  it('shows virtual profile empty state without requiring a user id', () => {
    const html = htmlOf(
      <PlayerProfileModal userId={null} virtualName="虚拟刘备" onClose={vi.fn()} />,
    );

    expect(html).toContain('虚拟刘备');
    expect(html).toContain('虚拟角色没有绑定账号资料');
    expect(html).not.toContain('正在读取资料');
  });

  it('accepts zero, one and two-turn lianliankan paths only for matching tiles', () => {
    const tiles: LianliankanTile[] = [
      { tileId: 'a', itemId: 'x', row: 0, col: 0 },
      { tileId: 'b', itemId: 'x', row: 0, col: 1 },
      { tileId: 'c', itemId: 'x', row: 1, col: 1 },
      { tileId: 'd', itemId: 'x', row: 2, col: 0 },
      { tileId: 'e', itemId: 'y', row: 2, col: 2 },
    ];
    const map = new Map(tiles.map((tile) => [tile.tileId, tile]));

    expect(canConnect(map, tiles[0]!, tiles[1]!)).toBe(true);
    expect(canConnect(map, tiles[0]!, tiles[3]!)).toBe(true);
    expect(canConnect(map, tiles[0]!, tiles[4]!)).toBe(false);
  });

  it('keeps the lianliankan sheet id stable', () => {
    expect(LIANLIANKAN_SHEET_ID).toBe('lianliankan');
  });

  it('builds demo boards from theme and difficulty', () => {
    const demo = buildDemoBoard(['apple', 'pear'], 2, 2, 2);
    expect(demo).toHaveLength(4);
    expect(demo.map((tile) => tile.itemId)).toEqual(['apple', 'pear', 'apple', 'pear']);
  });

  it('restores non-room sheets from localStorage helpers', () => {
    expect(isSheetId('lianliankan')).toBe(true);
    expect(isSheetId('current-room')).toBe(true);
    expect(isSheetId('not-a-sheet')).toBe(false);
  });
});
