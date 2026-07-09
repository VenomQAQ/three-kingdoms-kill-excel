import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canUseAsGuohe,
  canUseAsLebu,
  canUseAsSha,
  CharacterRegistry,
  type EnginePlayerState,
} from '@tk/engine';
import type { GameType, RoomPlayer } from '@tk/shared';
import type { HandCardPick } from './types/hand';
import { TitleBar } from './components/wps/TitleBar';
import { CardDetailModal } from './components/wps/CardDetailModal';
import { CharacterSkillModal } from './components/wps/CharacterSkillModal';
import { GamePromptModal } from './components/wps/GamePromptModal';
import { Ribbon, RibbonAction } from './components/wps/Ribbon';
import { InfoBar } from './components/wps/InfoBar';
import { PlayControlBar } from './components/wps/PlayControlBar';
import { FormulaBar } from './components/wps/FormulaBar';
import { SheetTabs } from './components/wps/SheetTabs';
import { StatusBar } from './components/wps/StatusBar';
import { DecoyGrid } from './components/wps/DecoyGrid';
import { RoomListGrid } from './components/wps/RoomListGrid';
import { GameGrid } from './components/wps/GameGrid';
import { LianliankanGrid } from './components/wps/LianliankanGrid';
import { ChatPanel } from './components/wps/ChatPanel';
import { LobbyChatPanel } from './components/wps/LobbyChatPanel';
import { LoginDialog } from './components/wps/LoginDialog';
import { ChangePasswordDialog } from './components/wps/ChangePasswordDialog';
import { PlayerProfileModal } from './components/wps/PlayerProfileModal';
import { SettingsDialog } from './components/wps/SettingsDialog';
import { BossKeyOverlay } from './components/wps/BossKeyOverlay';
import { Toast } from './components/wps/Toast';
import {
  CURRENT_ROOM_SHEET_ID,
  DEFAULT_FILE_NAMES,
  LIANLIANKAN_SHEET_ID,
  ROOM_LIST_SHEET_ID,
  SANDBOX_ROOM_CODE,
  SALES_SHEET_ID,
  SheetId,
} from './data/decoy';
import { useAppStore } from './store/appStore';
import { useToastStore } from './store/toastStore';
import { HttpError } from './api';
import { formatGeneralName } from './utils/display';
import {
  loadBossKeyShortcut,
  matchesBossKeyShortcut,
  saveBossKeyShortcut,
  type BossKeyShortcut,
} from './utils/bossKey';
import {
  loadBossKeyAction,
  saveBossKeyAction,
  type BossKeyAction,
} from './utils/bossKeyConfig';
import { loadBossKeyImageObjectUrl } from './utils/bossKeyImageStore';
import { confirmLogout } from './utils/logout';
import gridStyles from './components/wps/SpreadsheetGrid.module.css';
import styles from './App.module.css';

function formatTurnName(roomGameType: GameType | undefined, player?: RoomPlayer | null): string {
  if (!player) return '';
  return roomGameType === 'monopoly' ? (player.nickname || player.id) : formatGeneralName(player);
}

function asEnginePlayer(player: RoomPlayer): EnginePlayerState {
  return {
    id: player.id,
    seat: player.seat ?? 0,
    nickname: player.nickname,
    generalId: player.general ?? player.id,
    generalName: player.general ?? player.nickname,
    role: player.role ?? '反贼',
    roleRevealed: player.roleRevealed,
    kingdom: 'shu',
    hp: player.hp ?? 4,
    maxHp: player.maxHp ?? 4,
    handCards: player.handCards ?? [],
    equipment: player.equipment ?? [],
    judgeCards: player.judgeCards ?? [],
    shaUsedCount: 0,
    skillUseCount: {},
    skillTargetUseCount: {},
    dead: player.dead,
  };
}

function App() {
  const [bgColorToken, setBgColorToken] = useState(() => {
    if (typeof window === 'undefined') return '#ffffff';
    return window.localStorage.getItem('tk_bg_color_token')?.trim() || '#ffffff';
  });
  const [showMonopolyCellColors, setShowMonopolyCellColors] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tk_monopoly_cell_colors') === '1';
  });
  const [activeSheet, setActiveSheet] = useState<SheetId>(ROOM_LIST_SHEET_ID);
  const [bossKeyShortcut, setBossKeyShortcut] = useState<BossKeyShortcut>(() => loadBossKeyShortcut());
  const [bossKeyAction, setBossKeyAction] = useState<BossKeyAction>(() => loadBossKeyAction());
  const [bossMode, setBossMode] = useState(false);
  const [bossImageUrl, setBossImageUrl] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState('A1');
  const [selectedHand, setSelectedHand] = useState<HandCardPick | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [sandboxCharName, setSandboxCharName] = useState('');
  const [skillModalPlayer, setSkillModalPlayer] = useState<RoomPlayer | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [virtualProfileName, setVirtualProfileName] = useState<string | null>(null);
  const [detailCardName, setDetailCardName] = useState<string | null>(null);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [defaultGameType, setDefaultGameType] = useState<GameType>(() => {
    if (typeof window === 'undefined') return 'sanguosha';
    return window.localStorage.getItem('tk_default_game_type') === 'monopoly'
      ? 'monopoly'
      : 'sanguosha';
  });

  const showToast = useToastStore((s) => s.show);

  const handleViewPlayerProfile = useCallback((player: RoomPlayer) => {
    setProfileUserId(player.userId ?? null);
    setVirtualProfileName(player.userId ? null : player.nickname || player.general || '虚拟角色');
  }, []);

  const closePlayerProfile = useCallback(() => {
    setProfileUserId(null);
    setVirtualProfileName(null);
  }, []);

  const {
    connect,
    connected,
    connectionStatus,
    room,
    roomList,
    playerId,
    actingPlayerId,
    nickname,
    setNickname,
    fetchRoomList,
    createRoom,
    joinRoom,
    joinSandbox,
    leaveRoom,
    disbandRoom,
    switchRoomGame,
    toggleReady,
    startGame,
    selectGeneral,
    sandboxAddPlayer,
    sandboxRemoveLastVirtual,
    sandboxSwitchActor,
    sandboxStart,
    sandboxPlayCard,
    sandboxConfirmPlay,
    sandboxSelectTargets,
    sandboxSubmitResponse,
    sandboxUseSkill,
    sandboxRendeGive,
    sandboxQingnangRecover,
    sandboxZhihengConfirm,
    sandboxModifyJudge,
    sandboxSkipModifyJudge,
    sandboxDiscardCards,
    sandboxCancelDiscard,
    sandboxSelectZoneCard,
    sandboxEndTurn,
    monopolyRoll,
    monopolyBuy,
    monopolyUpgrade,
    monopolySkip,
    sendChat,
    chatMessages,
    lastError,
    clearError,
    hydrate,
    authStatus,
    capabilities,
    currentVersion,
    logout,
    checkIn,
    lobbyMessages,
    subscribeLobbyChat,
    unsubscribeLobbyChat,
    sendLobbyChat,
    user,
    lianliankanConfig,
    lianliankanSession,
    lianliankanLoading,
    lianliankanSettling,
    loadLianliankanConfig,
    startLianliankan,
    finishLianliankan,
  } = useAppStore();

  const handleViewChatProfile = useCallback((message: { playerId?: string; userId?: string; nickname: string }) => {
    const roomPlayer = message.playerId ? room?.players.find((player) => player.id === message.playerId) : null;
    const userId = message.userId ?? roomPlayer?.userId ?? null;
    setProfileUserId(userId);
    setVirtualProfileName(userId ? null : message.nickname || roomPlayer?.nickname || '虚拟角色');
  }, [room?.players]);

  useEffect(() => {
    // REQ-2026-001 · FE-2/FE-9 · 首屏并发拉 capabilities + me；无论成功失败都不阻塞后续 socket 连接
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    connect();
  }, [connect]);

  const isAuthed = authStatus === 'authed';
  const isGuest = authStatus === 'guest';
  const sandboxEnabled = capabilities?.sandboxEnabled ?? true;
  const versions = capabilities?.versions ?? [];
  const onLobbySheet = activeSheet === ROOM_LIST_SHEET_ID;
  const onCurrentRoomSheet = activeSheet === CURRENT_ROOM_SHEET_ID;
  const onLianliankanSheet = activeSheet === LIANLIANKAN_SHEET_ID;
  const onSalesSheet = activeSheet === SALES_SHEET_ID;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tk_bg_color_token', bgColorToken);
  }, [bgColorToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tk_monopoly_cell_colors', showMonopolyCellColors ? '1' : '0');
  }, [showMonopolyCellColors]);

  useEffect(() => {
    if (onLianliankanSheet && !lianliankanConfig) {
      void loadLianliankanConfig().catch((err) => {
        const code = err instanceof HttpError ? err.code : undefined;
        useAppStore.getState().showError(
          code,
          err instanceof Error ? err.message : '连连看配置加载失败',
        );
      });
    }
  }, [onLianliankanSheet, lianliankanConfig, loadLianliankanConfig]);

  useEffect(() => {
    if (!room || bossMode || typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      'roomContext',
      JSON.stringify({ roomCode: room.code, activeSheet, enteredAt: Date.now() }),
    );
  }, [room?.code, activeSheet, bossMode]);

  useEffect(() => {
    if (authStatus !== 'authed' || !connected || room || bossMode || typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem('roomContext');
    if (!raw) return;
    try {
      const context = JSON.parse(raw) as { roomCode?: string; activeSheet?: SheetId; enteredAt?: number };
      if (!context.roomCode) return;
      const reconnectGraceMs = (capabilities?.session.reconnectGraceSec ?? 300) * 1000;
      if (context.enteredAt && Date.now() - context.enteredAt > reconnectGraceMs) {
        window.sessionStorage.removeItem('roomContext');
        return;
      }
      void joinRoom(context.roomCode)
        .then(() => setActiveSheet(CURRENT_ROOM_SHEET_ID))
        .catch(() => window.sessionStorage.removeItem('roomContext'));
    } catch {
      window.sessionStorage.removeItem('roomContext');
    }
  }, [authStatus, connected, room, bossMode, joinRoom, capabilities?.session.reconnectGraceSec]);

  useEffect(() => {
    if (authStatus === 'guest' && !room) {
      setShowLoginDialog(true);
    }
  }, [authStatus, room]);

  useEffect(() => {
    if (onLobbySheet && !bossMode) {
      subscribeLobbyChat();
      return () => unsubscribeLobbyChat();
    }
    return undefined;
  }, [onLobbySheet, bossMode, subscribeLobbyChat, unsubscribeLobbyChat]);

  useEffect(() => {
    if (lastError) showToast(lastError);
  }, [lastError, showToast]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchRoomList();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchRoomList]);

  useEffect(() => {
    saveBossKeyShortcut(bossKeyShortcut);
  }, [bossKeyShortcut]);

  useEffect(() => {
    saveBossKeyAction(bossKeyAction);
  }, [bossKeyAction]);

  const closeBossImage = useCallback(() => {
    setBossImageUrl(null);
  }, []);

  useEffect(() => {
    const url = bossImageUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [bossImageUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesBossKeyShortcut(e, bossKeyShortcut)) return;
      e.preventDefault();

      if (bossImageUrl) {
        closeBossImage();
        return;
      }

      void (async () => {
        if (bossKeyAction === 'custom-image') {
          const url = await loadBossKeyImageObjectUrl();
          if (url) {
            setBossImageUrl(url);
            return;
          }
        }

        setBossMode(true);
        document.title = '第 1 季度区域销售汇总.xlsx';
        window.localStorage.setItem('tk_browser_title', '第 1 季度区域销售汇总.xlsx');
        setActiveSheet(SALES_SHEET_ID);
      })();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bossKeyShortcut, bossKeyAction, bossImageUrl, closeBossImage]);

  useEffect(() => {
    if (room && !bossMode) {
      setActiveSheet(CURRENT_ROOM_SHEET_ID);
    }
  }, [room?.code, bossMode]);

  const isSandbox = room?.isSandbox || room?.code === SANDBOX_ROOM_CODE;
  const isPlaying = room?.status === 'playing' || room?.status === 'finished';
  const isMonopolyPlaying = room?.gameType === 'monopoly' && isPlaying;
  const controlId = isSandbox ? (actingPlayerId ?? playerId) : playerId;
  const controlPlayer = room?.players.find((p) => p.id === controlId);
  const actingPlayer = controlPlayer;
  const actingId = controlId;
  const turnPlayer =
    room?.gameType === 'monopoly' && room.monopoly != null && isPlaying
      ? room.players.find((player) => player.id === room.monopoly?.players[room.monopoly.turnIndex]?.playerId)
        ?? (room.monopoly.players[room.monopoly.turnIndex]
          ? {
              id: room.monopoly.players[room.monopoly.turnIndex]!.playerId,
              nickname: room.monopoly.players[room.monopoly.turnIndex]!.nickname,
              ready: false,
              connected: true,
            }
          : null)
      : room?.sandbox != null && isPlaying
      ? room.players[room.sandbox.turnIndex]
      : null;
  const gamePrompt = room?.sandbox?.prompt ?? null;
  const turnPhase = room?.sandbox?.turnPhase;
  const canOperateTurn =
    isPlaying && turnPlayer != null && actingId === turnPlayer.id;
  const canPlayCards =
    room?.gameType !== 'monopoly' && canOperateTurn && (turnPhase === 'play' || !turnPhase) && !gamePrompt;

  const PHASE_LABEL: Record<string, string> = {
    prepare: '准备阶段',
    judge: '判定阶段',
    before_draw: '摸牌前',
    draw: '摸牌阶段',
    play: '出牌阶段',
    discard: '弃牌阶段',
    end: '结束阶段',
  };
  const isHost = room?.hostId === playerId;
  const prevTurnIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSandbox && gamePrompt && gamePrompt.playerId !== actingId) {
      sandboxSwitchActor(gamePrompt.playerId);
    }
  }, [isSandbox, gamePrompt?.id, gamePrompt?.playerId, actingId, sandboxSwitchActor]);

  /** 回合结束后自动切换操控到当前回合角色 */
  useEffect(() => {
    if (!isPlaying || !isSandbox || !room?.sandbox) {
      prevTurnIndexRef.current = null;
      return;
    }
    const turnIdx = room.sandbox.turnIndex;
    if (prevTurnIndexRef.current === null) {
      prevTurnIndexRef.current = turnIdx;
      return;
    }
    if (prevTurnIndexRef.current !== turnIdx) {
      prevTurnIndexRef.current = turnIdx;
      const nextPlayer = room.players[turnIdx];
      if (nextPlayer && actingId !== nextPlayer.id) {
        sandboxSwitchActor(nextPlayer.id);
      }
    }
  }, [
    room?.sandbox?.turnIndex,
    room?.players,
    isPlaying,
    isSandbox,
    actingId,
    sandboxSwitchActor,
  ]);

  useEffect(() => {
    if (gamePrompt) setSelectedHand(null);
  }, [gamePrompt?.id]);

  useEffect(() => {
    setPromptCollapsed(false);
  }, [gamePrompt?.id]);

  const resolveHandIndex = useCallback(
    (card: string, handIndex?: number) => {
      const hand = actingPlayer?.handCards ?? [];
      if (handIndex != null && handIndex >= 0 && handIndex < hand.length) {
        return handIndex;
      }
      if (selectedHand?.name === card) return selectedHand.index;
      return hand.indexOf(card);
    },
    [actingPlayer?.handCards, selectedHand],
  );

  const handlePlayCard = useCallback(
    (card: string, handIndex?: number) => {
      const idx = resolveHandIndex(card, handIndex);
      if (idx >= 0) setSelectedHand({ name: card, index: idx });
      if (!isPlaying) return;
      if (!canOperateTurn) {
        useAppStore.setState({
          lastError: isSandbox
            ? '请用「操控」下拉框切换到当前回合角色'
            : '当前不是你的回合',
        });
        return;
      }
      if (gamePrompt) {
        useAppStore.setState({ lastError: '请先完成当前弹窗（确认/选目标/响应/仁德/弃牌）' });
        return;
      }
      if (turnPhase && turnPhase !== 'play') {
        useAppStore.setState({
          lastError: `当前为${PHASE_LABEL[turnPhase] ?? turnPhase}，须在出牌阶段打出`,
        });
        return;
      }
      sandboxPlayCard(card, idx >= 0 ? idx : undefined);
    },
    [
      isSandbox,
      isPlaying,
      canOperateTurn,
      gamePrompt,
      turnPhase,
      sandboxPlayCard,
      resolveHandIndex,
    ],
  );

  const handlePlayVirtualCard = useCallback(
    (cardName: string) => {
      if (!selectedHand) return;
      handlePlayCard(cardName, selectedHand.index);
    },
    [handlePlayCard, selectedHand],
  );

  const handleSelectHand = useCallback((card: string, index: number) => {
    setSelectedHand((prev) =>
      prev?.index === index ? null : { name: card, index },
    );
  }, []);

  const sandboxGenerals = useMemo(() => CharacterRegistry.getAll(), []);

  const requireAuth = useCallback(
    (action: () => void | Promise<void>) => {
      if (!isAuthed) {
        showToast('请先登录');
        setShowLoginDialog(true);
        return;
      }
      void action();
    },
    [isAuthed, showToast],
  );

  const handleChangeNickname = useCallback(async () => {
    if (!isAuthed) {
      showToast('请先登录后修改显示昵称');
      setShowLoginDialog(true);
      return;
    }
    const next = window.prompt('请输入新昵称', nickname)?.trim();
    if (!next || next === nickname) return;
    try {
      await setNickname(next);
      showToast('昵称已更新');
    } catch (err) {
      const code = err instanceof HttpError ? err.code : undefined;
      useAppStore.getState().showError(
        code,
        err instanceof Error ? err.message : '昵称更新失败',
      );
    }
  }, [isAuthed, nickname, setNickname, showToast]);

  const handleDefaultGameTypeChange = useCallback((type: GameType) => {
    setDefaultGameType(type);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tk_default_game_type', type);
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    if (!isAuthed) {
      showToast('请先登录');
      setShowLoginDialog(true);
      return;
    }
    try {
      await checkIn();
    } catch (err) {
      const code = err instanceof HttpError ? err.code : undefined;
      useAppStore.getState().showError(
        code,
        err instanceof Error ? err.message : '签到失败',
      );
    }
  }, [checkIn, isAuthed, showToast]);

  const handleLogout = useCallback(async () => {
    if (!confirmLogout(room)) return;
    setActiveSheet(ROOM_LIST_SHEET_ID);
    setSelectedHand(null);
    await logout();
  }, [logout, room]);

  const handleLeaveRoom = useCallback(() => {
    if (!room) return;
    if (
      !room.isSandbox &&
      (room.status === 'selecting' || room.status === 'playing') &&
      typeof window !== 'undefined'
    ) {
      const ok = window.confirm('确认离开将扣除 5 金币，最低扣至 0；取消则继续留在房间。');
      if (!ok) return;
    }
    leaveRoom('manual');
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('roomContext');
    setActiveSheet(ROOM_LIST_SHEET_ID);
    setSelectedHand(null);
  }, [leaveRoom, room]);

  const handleDisbandRoom = useCallback(() => {
    if (!room || !isHost) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm('确认解散当前房间？所有玩家都会返回房间列表。');
      if (!ok) return;
    }
    disbandRoom();
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('roomContext');
    setActiveSheet(ROOM_LIST_SHEET_ID);
    setSelectedHand(null);
  }, [disbandRoom, isHost, room]);

  const handleSwitchRoomGame = useCallback((gameType?: GameType) => {
    if (!room || !isHost || room.status !== 'waiting') return;
    switchRoomGame(gameType ?? (room.gameType === 'monopoly' ? 'sanguosha' : 'monopoly'));
  }, [isHost, room, switchRoomGame]);

  const handleRibbonAction = useCallback(
    async (id: string) => {
      clearError();
      if (isGuest && ['create', 'joinSandbox', 'ready', 'start'].includes(id)) {
        showToast('请先登录');
        setShowLoginDialog(true);
        return;
      }
      if (id === 'joinSandbox' && !sandboxEnabled) {
        showToast('测试房未启用');
        return;
      }
      switch (id) {
        case 'create':
          await createRoom(defaultGameType);
          break;
        case 'joinSandbox':
          await joinSandbox();
          break;
        case 'leave':
          handleLeaveRoom();
          break;
        case 'disband':
          handleDisbandRoom();
          break;
        case 'switchGame':
          handleSwitchRoomGame();
          break;
        case 'ready':
          toggleReady();
          break;
        case 'start':
          if (isSandbox) sandboxStart();
          else startGame();
          break;
        case 'addChar': {
          const general = sandboxCharName.trim();
          const name = general || `角色${(room?.players.length ?? 0) + 1}`;
          sandboxAddPlayer(name, general || name);
          setSandboxCharName('');
          break;
        }
        case 'removeChar':
          sandboxRemoveLastVirtual();
          break;
        case 'playCard':
          if (selectedHand) handlePlayCard(selectedHand.name, selectedHand.index);
          break;
        case 'playAsSha':
          handlePlayVirtualCard('杀');
          break;
        case 'playAsGuohe':
          handlePlayVirtualCard('过河拆桥');
          break;
        case 'playAsLebu':
          handlePlayVirtualCard('乐不思蜀');
          break;
        case 'endTurn':
          sandboxEndTurn();
          setSelectedHand(null);
          break;
        case 'switchNext': {
          if (!room) break;
          const idx = room.players.findIndex((p) => p.id === actingId);
          const next = room.players[(idx + 1) % room.players.length];
          if (next) sandboxSwitchActor(next.id);
          break;
        }
        default:
          break;
      }
    },
    [
      clearError,
      isGuest,
      sandboxEnabled,
      showToast,
      createRoom,
      joinSandbox,
      handleLeaveRoom,
      handleDisbandRoom,
      handleSwitchRoomGame,
      toggleReady,
      startGame,
      sandboxStart,
      sandboxAddPlayer,
      sandboxRemoveLastVirtual,
      sandboxEndTurn,
      sandboxSwitchActor,
      handlePlayCard,
      handlePlayVirtualCard,
      selectedHand,
      sandboxCharName,
      room,
      actingId,
      isSandbox,
      defaultGameType,
    ],
  );

  const formulaVirtualIndex = useCallback(
    (cardName: string, hand: string[]) => {
      if (!actingPlayer) return -1;
      const enginePlayer = asEnginePlayer(actingPlayer);
      return hand.findIndex((entry) => {
        if (cardName === '杀') return canUseAsSha(enginePlayer, entry);
        if (cardName === '过河拆桥') return canUseAsGuohe(enginePlayer, entry);
        if (cardName === '乐不思蜀') return canUseAsLebu(enginePlayer, entry);
        return false;
      });
    },
    [actingPlayer],
  );

  const ribbonActions: RibbonAction[] = useMemo(() => {
    const inRoom = !!room;
    const playing = isPlaying;

    if (onLobbySheet) {
      return [
        { id: 'create', label: '创建房间', icon: '➕', disabled: inRoom || isGuest },
        ...(sandboxEnabled
          ? [{ id: 'joinSandbox', label: '测试房', icon: '🧪', disabled: inRoom || isGuest }]
          : []),
      ];
    }

    if (onSalesSheet || onLianliankanSheet) {
      return [];
    }

    if (!onCurrentRoomSheet) {
      return [];
    }

    if (playing) {
      const isSanguoshaGame = room?.gameType !== 'monopoly';
      const selectedCardName = selectedHand?.name.match(/【(.+?)】$/)?.[1] ?? selectedHand?.name;
      const engineActor = actingPlayer ? asEnginePlayer(actingPlayer) : null;
      const canVirtualSha =
        !!selectedHand &&
        !!engineActor &&
        selectedCardName !== '杀' &&
        canUseAsSha(engineActor, selectedHand.name);
      const canVirtualGuohe =
        !!selectedHand &&
        !!engineActor &&
        selectedCardName !== '过河拆桥' &&
        canUseAsGuohe(engineActor, selectedHand.name);
      const canVirtualLebu =
        !!selectedHand &&
        !!engineActor &&
        selectedCardName !== '乐不思蜀' &&
        canUseAsLebu(engineActor, selectedHand.name);
      const actions: RibbonAction[] = isSanguoshaGame
        ? [
            {
              id: 'playCard',
              label: '打出',
              icon: '🃏',
              disabled: !canPlayCards || !selectedHand,
            },
            {
              id: 'endTurn',
              label: '结束回合',
              icon: '⏭',
              disabled: !canOperateTurn || !!gamePrompt,
            },
          ]
        : [];
      if (isSanguoshaGame && canVirtualSha) {
        actions.push({
          id: 'playAsSha',
          label: '当杀',
          icon: '⚔',
          disabled: !canPlayCards || !selectedHand,
        });
      }
      if (isSanguoshaGame && canVirtualGuohe) {
        actions.push({
          id: 'playAsGuohe',
          label: '当拆',
          icon: '✂',
          disabled: !canPlayCards || !selectedHand,
        });
      }
      if (isSanguoshaGame && canVirtualLebu) {
        actions.push({
          id: 'playAsLebu',
          label: '当乐',
          icon: '⌛',
          disabled: !canPlayCards || !selectedHand,
        });
      }
      if (isSandbox) {
        actions.push({
          id: 'switchNext',
          label: '切换角色',
          icon: '🔄',
        });
      }
      actions.push({ id: 'leave', label: '离开', icon: '🚪' });
      return actions;
    }

    const base: RibbonAction[] = [
      {
        id: 'disband',
        label: '解散房间',
        icon: '×',
        disabled: !inRoom || !isHost || !!isSandbox || playing,
      },
      { id: 'leave', label: '离开', icon: '🚪', disabled: !inRoom },
      {
        id: 'switchGame',
        label: '切换游戏',
        icon: '↔',
        disabled: !inRoom || !isHost || !!isSandbox || playing || room?.status !== 'waiting',
      },
      {
        id: 'ready',
        label: '准备',
        icon: '✓',
        disabled: !inRoom || playing || !!isSandbox,
      },
      {
        id: 'start',
        label: isSandbox ? '模拟开局' : '开始',
        icon: '▶',
        disabled: !inRoom || playing || (!isSandbox && !isHost),
      },
    ];
    if (isSandbox && inRoom && !playing) {
      base.push(
        { id: 'addChar', label: '添加角色', icon: '👤' },
        { id: 'removeChar', label: '移除角色', icon: '➖' },
      );
    }
    return base;
  }, [room, isSandbox, isHost, isPlaying, canPlayCards, canOperateTurn, gamePrompt, selectedHand, isGuest, sandboxEnabled, onLobbySheet, onCurrentRoomSheet, onLianliankanSheet, onSalesSheet, actingPlayer]);

  const handleFormulaSubmit = useCallback(async () => {
    const raw = formulaInput.trim();
    if (!raw) return;

    clearError();

    if (raw.startsWith('/')) {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(' ');

      switch (cmd.toLowerCase()) {
        case 'nick':
          if (!isAuthed) {
            showToast('请先登录后修改显示昵称');
            break;
          }
          try {
            await setNickname(arg || nickname);
            showToast('昵称已更新');
          } catch (err) {
            const code = err instanceof HttpError ? err.code : undefined;
            useAppStore.getState().showError(
              code,
              err instanceof Error ? err.message : '昵称更新失败',
            );
          }
          break;
        case 'create':
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          await createRoom(defaultGameType);
          break;
        case 'monopoly':
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          await createRoom('monopoly');
          break;
        case 'join':
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          await joinRoom(arg);
          break;
        case 'sandbox':
        case 'test':
          if (!sandboxEnabled) {
            showToast('测试房未启用');
            break;
          }
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          await joinSandbox();
          break;
        case 'leave':
          handleLeaveRoom();
          break;
        case 'ready':
          toggleReady();
          break;
        case 'start':
          if (isSandbox) sandboxStart();
          else startGame();
          break;
        case 'add':
          sandboxAddPlayer(arg || `角色${(room?.players.length ?? 0) + 1}`, arg);
          break;
        case 'as': {
          const target = room?.players.find(
            (p) => p.nickname.includes(arg) || p.id === arg,
          );
          if (target) sandboxSwitchActor(target.id);
          else useAppStore.setState({ lastError: '未找到角色，请用 /as 昵称' });
          break;
        }
        case 'end':
          sandboxEndTurn();
          setSelectedHand(null);
          break;
        default:
          if (room) sendChat(raw);
      }
    } else if (onLobbySheet) {
      if (!isAuthed) {
        showToast('请先登录');
        setShowLoginDialog(true);
      } else {
        sendLobbyChat(raw);
      }
    } else if (isPlaying) {
      const hand = actingPlayer?.handCards ?? [];
      const matchedIndex = hand.findIndex((card) => card === raw);
      if (matchedIndex >= 0) {
        handlePlayCard(raw, matchedIndex);
      } else {
        const virtualIndex = formulaVirtualIndex(raw, hand);
        if (virtualIndex >= 0) handlePlayCard(raw, virtualIndex);
        else if (room) sendChat(raw);
      }
    } else if (room) {
      sendChat(raw);
    }

    setFormulaInput('');
  }, [
    formulaInput,
    clearError,
    isAuthed,
    isGuest,
    sandboxEnabled,
    showToast,
    setNickname,
    nickname,
    versions,
    onLobbySheet,
    sendLobbyChat,
    createRoom,
    joinRoom,
    joinSandbox,
    handleLeaveRoom,
    toggleReady,
    startGame,
    sandboxStart,
    sandboxAddPlayer,
    sandboxSwitchActor,
    sandboxEndTurn,
    handlePlayCard,
    sendChat,
    room,
    isSandbox,
    isPlaying,
    actingPlayer?.handCards,
    defaultGameType,
  ]);

  const showCurrentRoomSheet = !!room && !bossMode;
  const displaySheet = activeSheet;

  const fileName = showCurrentRoomSheet && displaySheet === CURRENT_ROOM_SHEET_ID
    ? isPlaying
      ? `对局面板_${room?.code}.xlsx`
      : room?.isSandbox
        ? `模拟测试_${SANDBOX_ROOM_CODE}.xlsx`
        : `对局_${room?.code}.xlsx`
    : DEFAULT_FILE_NAMES[displaySheet];

  const roomStatusLabel = isPlaying
    ? '游戏中'
    : room?.status === 'finished'
      ? '已结束'
      : room?.status === 'selecting'
        ? '选将中'
        : '等待中';

  const accountLabel = user
    ? `Lv.${user.level} ${user.nickname} · ${user.coins}金币`
    : '未登录';

  return (
    <div className={styles.app}>
      <TitleBar
        fileName={fileName}
        accountLabel={accountLabel}
        isAuthed={isAuthed}
        onLogout={() => void handleLogout()}
      />
      <Ribbon
        actions={ribbonActions}
        onAction={handleRibbonAction}
        actingPlayer={actingPlayer ?? undefined}
        turnPhase={turnPhase}
        canUseSkills={canOperateTurn && !gamePrompt}
        onUseSkill={(id) => sandboxUseSkill(id)}
        versions={versions}
        currentVersionId={currentVersion}
        currentGameType={defaultGameType}
        onGameTypeChange={handleDefaultGameTypeChange}
        versionDisabled={!isAuthed}
        onCheckIn={() => void handleCheckIn()}
        checkInDisabled={authStatus === 'loading'}
        onOpenSettings={() => setShowSettingsDialog(true)}
        hideSkillsPanel={isMonopolyPlaying}
      />
      <InfoBar
        nickname={nickname}
        connectionStatus={connectionStatus}
        accountLabel={accountLabel}
        roomCode={bossMode ? undefined : room?.code}
        roomStatus={room ? roomStatusLabel : undefined}
        actingName={isMonopolyPlaying ? undefined : formatGeneralName(actingPlayer)}
        turnName={formatTurnName(room?.gameType, turnPlayer)}
        isAuthed={isAuthed}
        onLoginClick={() => setShowLoginDialog(true)}
        onProfileClick={() => {
          if (user?.userId) {
            setProfileUserId(user.userId);
            setVirtualProfileName(null);
          }
        }}
        onChangeNickname={handleChangeNickname}
        onChangePassword={() => setShowChangePasswordDialog(true)}
        onLogout={() => void handleLogout()}
      />
      {isPlaying && room && room.gameType !== 'monopoly' && (
        <PlayControlBar
          actingPlayer={actingPlayer}
          turnPlayer={turnPlayer ?? undefined}
          turnPhase={turnPhase}
          selectedHand={selectedHand}
          canOperate={canOperateTurn && !gamePrompt}
          players={room.players}
          onSelectHand={handleSelectHand}
          onPlayCard={handlePlayCard}
          onUseSkill={(id) => sandboxUseSkill(id)}
          onEndTurn={() => {
            sandboxEndTurn();
            setSelectedHand(null);
          }}
          onSwitchActor={(id) => sandboxSwitchActor(id)}
        />
      )}
      {isSandbox && room && !isPlaying && (
        <div className={styles.sandboxInput}>
          <label>
            添加武将
            <select
              className={styles.sandboxSelect}
              value={sandboxCharName}
              onChange={(e) => setSandboxCharName(e.target.value)}
            >
              <option value="">请选择武将</option>
              {sandboxGenerals.map((ch) => (
              <option key={ch.id} value={ch.name}>
                  {formatGeneralName({ general: ch.name })}
              </option>
            ))}
            </select>
          </label>
          <span className={styles.sandboxHint}>
            添加角色后点击「模拟开局」，对局将切换为图 2 式战场表格
          </span>
        </div>
      )}
      <FormulaBar
        cellRef={selectedCell}
        value={formulaInput}
        onChange={setFormulaInput}
        onSubmit={handleFormulaSubmit}
        placeholder={
          isPlaying
            ? canPlayCards
              ? '输入牌名 Enter 出牌 · 或点击「打出选中」确认弹窗 · 「结束回合」结束'
              : gamePrompt
                ? '请按弹窗完成操作（响应/选目标/确认）'
                : isSandbox
                  ? `请切换操控到「${turnPlayer?.nickname ?? '当前角色'}」再出牌`
                  : turnPlayer?.id === playerId
                    ? '等待你的回合'
                    : `当前回合：${turnPlayer?.nickname ?? '—'}`
            : onLobbySheet
              ? isAuthed
                ? '大厅聊天或 /create · /join 房间号'
                : '登录后可发送消息 · /create · /join 需登录'
              : room
                ? '聊天或 /ready /start /add 角色名'
                : sandboxEnabled
                  ? '/create · /join 房间号 · /sandbox 测试房'
                  : '/create · /join 房间号'
        }
      />
      {lastError && (
        <div className={styles.error} onClick={clearError}>
          {lastError}（点击关闭）
        </div>
      )}
      {isPlaying && room && gamePrompt && promptCollapsed && (
        <div className={styles.promptDock}>
          <button
            type="button"
            className={styles.promptDockButton}
            onClick={() => setPromptCollapsed(false)}
          >
            继续当前操作：{gamePrompt.message || '打开弹窗'}
          </button>
        </div>
      )}
      <div
        className={
          onLobbySheet && !bossMode
            ? gridStyles.boardLayout
            : displaySheet === CURRENT_ROOM_SHEET_ID && room && !bossMode && !isPlaying
              ? styles.mainWithChat
              : styles.main
        }
      >
        {displaySheet === CURRENT_ROOM_SHEET_ID ? (
          room ? (
          <GameGrid
            room={room}
            chatMessages={chatMessages}
            playerId={playerId}
            actingPlayerId={actingId}
            selectedCell={selectedCell}
            selectedHand={selectedHand}
            showMonopolyCellColors={showMonopolyCellColors}
            onShowMonopolyCellColorsChange={setShowMonopolyCellColors}
            onSelectCell={setSelectedCell}
            onSelectHand={handleSelectHand}
            onPlayCard={handlePlayCard}
            onViewSkills={setSkillModalPlayer}
            onViewProfile={handleViewPlayerProfile}
            onViewChatProfile={handleViewChatProfile}
            onViewCard={setDetailCardName}
            onSendChat={sendChat}
            onMonopolyRoll={monopolyRoll}
            onMonopolyBuy={monopolyBuy}
            onMonopolyUpgrade={monopolyUpgrade}
            onMonopolySkip={monopolySkip}
            isSandbox={isSandbox}
            onToggleReady={toggleReady}
            onSelectGeneral={selectGeneral}
            onSwitchGame={handleSwitchRoomGame}
          />
          ) : (
            <DecoyGrid selectedCell={selectedCell} onSelectCell={setSelectedCell} />
          )
        ) : displaySheet === ROOM_LIST_SHEET_ID ? (
          <>
            <div className={gridStyles.gridPane}>
              <RoomListGrid
                rooms={roomList}
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                onJoinRoom={(code) => requireAuth(() => joinRoom(code))}
                onViewProfile={setProfileUserId}
                isGuest={isGuest}
                onGuestAction={() => {
                  showToast('请先登录');
                  setShowLoginDialog(true);
                }}
                bgColorToken={bgColorToken}
              />
              <LoginDialog open={showLoginDialog} onClose={() => setShowLoginDialog(false)} />
            </div>
            {!bossMode && (
              <LobbyChatPanel
                messages={lobbyMessages}
                visible
                canSend
                onSend={(content) => {
                  if (!isAuthed) {
                    showToast('请先登录');
                    setShowLoginDialog(true);
                    return;
                  }
                  sendLobbyChat(content);
                }}
                onViewProfile={(userId) => {
                  setProfileUserId(userId);
                  setVirtualProfileName(null);
                }}
              />
            )}
          </>
        ) : displaySheet === LIANLIANKAN_SHEET_ID ? (
          <LianliankanGrid
            config={lianliankanConfig}
            session={lianliankanSession}
            loading={lianliankanLoading}
            settling={lianliankanSettling}
            selectedCell={selectedCell}
            isAuthed={isAuthed}
            coins={user?.coins}
            onSelectCell={setSelectedCell}
            onStart={startLianliankan}
            onFinish={finishLianliankan}
            onRequireLogin={() => {
              showToast('请先登录');
              setShowLoginDialog(true);
            }}
          />
        ) : (
          <DecoyGrid selectedCell={selectedCell} onSelectCell={setSelectedCell} />
        )}
        {displaySheet === CURRENT_ROOM_SHEET_ID && room && !bossMode && !isPlaying && (
          <ChatPanel
            messages={chatMessages}
            visible
            onSend={sendChat}
            onViewProfile={handleViewChatProfile}
          />
        )}
      </div>
      <SheetTabs
        active={displaySheet}
        onSelect={(sheet) => {
          setActiveSheet(sheet);
          if (sheet !== SALES_SHEET_ID) setBossMode(false);
        }}
        currentRoomDisabled={!showCurrentRoomSheet}
      />
      <StatusBar
        roomCode={bossMode ? undefined : room?.code}
        connected={connected}
        playerCount={room?.players.length}
        zoom={100}
      />
      <Toast />
      <ChangePasswordDialog
        open={showChangePasswordDialog}
        onClose={() => setShowChangePasswordDialog(false)}
        onSuccess={() => setShowLoginDialog(true)}
      />
      <SettingsDialog
        open={showSettingsDialog}
        defaultGameType={defaultGameType}
        onDefaultGameTypeChange={handleDefaultGameTypeChange}
        bossKeyShortcut={bossKeyShortcut}
        onBossKeyShortcutChange={setBossKeyShortcut}
        bossKeyAction={bossKeyAction}
        onBossKeyActionChange={setBossKeyAction}
        bgColorToken={bgColorToken}
        onBgColorTokenChange={setBgColorToken}
        onChangeNickname={handleChangeNickname}
        onChangePassword={() => {
          setShowSettingsDialog(false);
          setShowChangePasswordDialog(true);
        }}
        onClose={() => setShowSettingsDialog(false)}
      />
      {bossImageUrl && <BossKeyOverlay imageUrl={bossImageUrl} />}
      {skillModalPlayer && (
        <CharacterSkillModal
          player={skillModalPlayer}
          onClose={() => setSkillModalPlayer(null)}
        />
      )}
      {detailCardName && (
        <CardDetailModal
          cardName={detailCardName}
          onClose={() => setDetailCardName(null)}
        />
      )}
      {(profileUserId || virtualProfileName) && (
        <PlayerProfileModal
          userId={profileUserId}
          virtualName={virtualProfileName ?? undefined}
          onClose={closePlayerProfile}
        />
      )}
      {isPlaying && room && gamePrompt && !promptCollapsed && (
        <GamePromptModal
          room={room}
          prompt={gamePrompt}
          actingPlayer={actingPlayer}
          onClose={
            gamePrompt.type === 'discard_cards'
              ? () => sandboxCancelDiscard(gamePrompt.id)
              : gamePrompt.type === 'select_targets' ||
                  gamePrompt.type === 'select_zone_card'
                ? () => sandboxConfirmPlay(gamePrompt.id, 'cancel')
              : (gamePrompt.type === 'use_skill' && gamePrompt.skillId === 'zhiheng') ||
                  gamePrompt.type === 'modify_judge' ||
                  gamePrompt.type === 'response' ||
                  (gamePrompt.type === 'use_skill' && gamePrompt.skillId === 'rende')
                ? () => setPromptCollapsed(true)
                : undefined
          }
          onConfirmPlay={(pid, cid) => sandboxConfirmPlay(pid, cid)}
          onSelectTargets={(pid, ids, zid) => sandboxSelectTargets(pid, ids, zid)}
          onSubmitResponse={(pid, cid) => sandboxSubmitResponse(pid, cid)}
          onRendeGive={(tid, cards, indices) =>
            sandboxRendeGive(tid, cards, indices)
          }
          onQingnangRecover={(tid, indices) => sandboxQingnangRecover(tid, indices)}
          onZhihengConfirm={(indices) => sandboxZhihengConfirm(indices)}
          onModifyJudge={(pid, idx, card) => sandboxModifyJudge(pid, idx, card)}
          onSkipModifyJudge={(pid) => sandboxSkipModifyJudge(pid)}
          onDiscardCards={(pid, indices) => sandboxDiscardCards(pid, indices)}
          onSelectZoneCard={(pid, choiceId) => sandboxSelectZoneCard(pid, choiceId)}
        />
      )}
    </div>
  );
}

export default App;
