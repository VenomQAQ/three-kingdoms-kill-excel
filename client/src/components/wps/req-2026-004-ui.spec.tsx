import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoomListItem, RoomPlayer } from '@tk/shared';
import { ROOM_LIST_SHEET_ID } from '../../data/decoy';
import { CharacterSkillModal } from './CharacterSkillModal';
import { Ribbon, type RibbonAction } from './Ribbon';
import { RoomListGrid } from './RoomListGrid';
import { SheetTabs } from './SheetTabs';

function htmlOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('REQ-2026-004 UI acceptance', () => {
  it('renders exactly the three required first-level sheets', () => {
    const html = htmlOf(
      <SheetTabs active={ROOM_LIST_SHEET_ID} onSelect={vi.fn()} currentRoomDisabled />,
    );

    expect(html).toContain('房间列表');
    expect(html).toContain('当前房间');
    expect(html).toContain('区域销售');
    expect((html.match(/<button/g) ?? []).length).toBe(4);
  });

  it('keeps lobby Ribbon actions separate from current-room actions', () => {
    const lobbyActions: RibbonAction[] = [
      { id: 'create', label: '创建房间', icon: '+' },
      { id: 'joinSandbox', label: '测试房', icon: 'T' },
    ];
    const html = htmlOf(
      <Ribbon actions={lobbyActions} onAction={vi.fn()} versions={[]} currentVersionId="standard-2014" />,
    );

    expect(html).toContain('创建房间');
    expect(html).toContain('测试房');
    expect(html).toContain('签到');
    expect(html).not.toContain('模拟开局');
    expect(html).not.toContain('添加角色');
    expect(html).not.toContain('打出');
    expect(html).not.toContain('结束回合');
  });

  it('renders room-state Ribbon actions without lobby creation actions', () => {
    const roomActions: RibbonAction[] = [
      { id: 'leave', label: '离开', icon: 'L' },
      { id: 'ready', label: '准备', icon: 'R' },
      { id: 'start', label: '开始', icon: 'S' },
    ];
    const html = htmlOf(<Ribbon actions={roomActions} onAction={vi.fn()} versions={[]} />);

    expect(html).toContain('离开');
    expect(html).toContain('准备');
    expect(html).toContain('开始');
    expect(html).not.toContain('创建房间');
  });

  it('shows configured phase-play skills without unsupported markers', () => {
    const player = {
      id: 'p1',
      nickname: '玩家A',
      general: '界刘备',
      role: '主公',
      roleRevealed: true,
      ready: true,
      connected: true,
      handCards: [],
      equipment: [],
      judgeCards: [],
      hp: 4,
      maxHp: 4,
    } satisfies RoomPlayer;
    const html = htmlOf(
      <Ribbon
        actions={[]}
        onAction={vi.fn()}
        actingPlayer={player}
        turnPhase="play"
        canUseSkills
        versions={[]}
      />,
    );

    expect(html).toContain('仁德');
    expect(html).not.toContain('暂不支持');
    expect(html).not.toContain('unsupported');
  });

  it('renders Chinese version names in the room list', () => {
    const rooms: RoomListItem[] = [
      {
        code: '123456',
        status: 'waiting',
        playerCount: 2,
        maxPlayers: 8,
        ownerNickname: '房主A',
        versionId: 'standard-2014',
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
      />,
    );

    expect(html).toContain('三国杀标准版·界限突破');
    expect(html).toContain('2/8');
  });

  it('uses 玩家 instead of 操控名 in the skill detail modal', () => {
    const player = {
      id: 'p1',
      nickname: '玩家A',
      general: '界刘备',
      role: '主公',
      roleRevealed: true,
      ready: true,
      connected: true,
      handCards: [],
      equipment: [],
      judgeCards: [],
      hp: 4,
      maxHp: 4,
    } satisfies RoomPlayer;
    const html = htmlOf(<CharacterSkillModal player={player} onClose={vi.fn()} />);

    expect(html).toContain('玩家');
    expect(html).not.toContain('操控名');
  });
});
