import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterRegistry } from '@tk/engine';
import type { RoomPlayer } from '@tk/shared';
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
import { ChatPanel } from './components/wps/ChatPanel';
import { LobbyChatPanel } from './components/wps/LobbyChatPanel';
import { LoginDialog } from './components/wps/LoginDialog';
import { ChangePasswordDialog } from './components/wps/ChangePasswordDialog';
import { Toast } from './components/wps/Toast';
import {
  DEFAULT_FILE_NAMES,
  GAME_SHEET_ID,
  SANDBOX_ROOM_CODE,
  SheetId,
} from './data/decoy';
import { useAppStore } from './store/appStore';
import { useToastStore } from './store/toastStore';
import { formatGeneralName } from './utils/display';
import gridStyles from './components/wps/SpreadsheetGrid.module.css';
import styles from './App.module.css';

function App() {
  const [activeSheet, setActiveSheet] = useState<SheetId>('sheet1');
  const [bossMode, setBossMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState('A1');
  const [selectedHand, setSelectedHand] = useState<HandCardPick | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [sandboxCharName, setSandboxCharName] = useState('');
  const [skillModalPlayer, setSkillModalPlayer] = useState<RoomPlayer | null>(null);
  const [detailCardName, setDetailCardName] = useState<string | null>(null);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);

  const showToast = useToastStore((s) => s.show);

  const {
    connect,
    connected,
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
    toggleReady,
    startGame,
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
    sandboxZhihengConfirm,
    sandboxModifyJudge,
    sandboxSkipModifyJudge,
    sandboxDiscardCards,
    sandboxCancelDiscard,
    sandboxSelectZoneCard,
    sandboxEndTurn,
    sendChat,
    chatMessages,
    lastError,
    clearError,
    hydrate,
    authStatus,
    user,
    capabilities,
    currentVersion,
    setCurrentVersion,
    logout,
    lobbyMessages,
    subscribeLobbyChat,
    unsubscribeLobbyChat,
    sendLobbyChat,
  } = useAppStore();

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
  const bgColorToken = capabilities?.bgColorToken ?? '#ffffff';
  const onLobbySheet = !room && activeSheet === 'sheet1';

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
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setBossMode((b) => !b);
        if (!bossMode) setActiveSheet('sheet2');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bossMode]);

  useEffect(() => {
    if (room && !bossMode) {
      setActiveSheet(GAME_SHEET_ID);
    }
  }, [room, bossMode]);

  const isSandbox = room?.isSandbox || room?.code === SANDBOX_ROOM_CODE;
  const isPlaying = room?.status === 'playing' || room?.status === 'finished';
  const controlId = isSandbox ? (actingPlayerId ?? playerId) : playerId;
  const controlPlayer = room?.players.find((p) => p.id === controlId);
  const actingPlayer = controlPlayer;
  const actingId = controlId;
  const turnPlayer =
    room?.sandbox != null && isPlaying
      ? room.players[room.sandbox.turnIndex]
      : null;
  const gamePrompt = room?.sandbox?.prompt ?? null;
  const turnPhase = room?.sandbox?.turnPhase;
  const canOperateTurn =
    isPlaying && turnPlayer != null && actingId === turnPlayer.id;
  const canPlayCards =
    canOperateTurn && (turnPhase === 'play' || !turnPhase) && !gamePrompt;

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
    if (gamePrompt && gamePrompt.playerId !== actingId) {
      sandboxSwitchActor(gamePrompt.playerId);
    }
  }, [gamePrompt?.id, gamePrompt?.playerId, actingId, sandboxSwitchActor]);

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
      if (
        handIndex != null &&
        handIndex >= 0 &&
        handIndex < hand.length &&
        hand[handIndex] === card
      ) {
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

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      if (!isAuthed) {
        showToast('请先登录');
        setShowLoginDialog(true);
        return;
      }
      if (versionId === currentVersion) return;
      setCurrentVersion(versionId);
    },
    [isAuthed, currentVersion, setCurrentVersion, showToast],
  );

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
          await createRoom();
          break;
        case 'joinSandbox':
          await joinSandbox();
          break;
        case 'leave':
          leaveRoom();
          setActiveSheet('sheet1');
          setSelectedHand(null);
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
      leaveRoom,
      toggleReady,
      startGame,
      sandboxStart,
      sandboxAddPlayer,
      sandboxRemoveLastVirtual,
      sandboxEndTurn,
      sandboxSwitchActor,
      handlePlayCard,
      selectedHand,
      sandboxCharName,
      room,
      actingId,
      isSandbox,
    ],
  );

  const ribbonActions: RibbonAction[] = useMemo(() => {
    const inRoom = !!room;
    const playing = isPlaying;

    if (playing) {
      const actions: RibbonAction[] = [
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
      ];
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
      { id: 'create', label: '创建房间', icon: '➕', disabled: inRoom || isGuest },
      ...(sandboxEnabled
        ? [{ id: 'joinSandbox', label: '测试房', icon: '🧪', disabled: inRoom || isGuest }]
        : []),
      { id: 'leave', label: '离开', icon: '🚪', disabled: !inRoom },
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
  }, [room, isSandbox, isHost, isPlaying, canPlayCards, canOperateTurn, gamePrompt, selectedHand, isGuest, sandboxEnabled]);

  const handleFormulaSubmit = useCallback(async () => {
    const raw = formulaInput.trim();
    if (!raw) return;

    clearError();

    if (raw.startsWith('/')) {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(' ');

      switch (cmd.toLowerCase()) {
        case 'nick':
          if (isAuthed) setNickname(arg || nickname);
          else showToast('请先登录后修改显示昵称');
          break;
        case 'version': {
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          const vid = arg.trim();
          if (!vid) {
            showToast(`当前版本：${currentVersion}`);
            break;
          }
          if (!versions.some((v) => v.id === vid)) {
            useAppStore.getState().showError('E_VERSION_UNKNOWN');
            break;
          }
          handleVersionSelect(vid);
          break;
        }
        case 'create':
          if (!isAuthed) {
            showToast('请先登录');
            setShowLoginDialog(true);
            break;
          }
          await createRoom();
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
          leaveRoom();
          setActiveSheet('sheet1');
          setSelectedHand(null);
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
      } else if (room) {
        sendChat(raw);
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
    currentVersion,
    versions,
    handleVersionSelect,
    onLobbySheet,
    sendLobbyChat,
    createRoom,
    joinRoom,
    joinSandbox,
    leaveRoom,
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
  ]);

  const showGameSheet = !!room && !bossMode;
  const displaySheet = showGameSheet ? GAME_SHEET_ID : activeSheet;

  const fileName = showGameSheet
    ? isPlaying
      ? `对局面板_${room?.code}.xlsx`
      : room?.isSandbox
        ? `模拟测试_${SANDBOX_ROOM_CODE}.xlsx`
        : `对局_${room?.code}.xlsx`
    : DEFAULT_FILE_NAMES[displaySheet === GAME_SHEET_ID ? 'sheet1' : displaySheet];

  const roomStatusLabel = isPlaying
    ? '游戏中'
    : room?.status === 'finished'
      ? '已结束'
      : '等待中';

  return (
    <div className={styles.app}>
      <TitleBar fileName={fileName} />
      <Ribbon
        actions={ribbonActions}
        onAction={handleRibbonAction}
        actingPlayer={actingPlayer ?? undefined}
        turnPhase={turnPhase}
        canUseSkills={canOperateTurn && !gamePrompt}
        onUseSkill={(id) => sandboxUseSkill(id)}
        versions={versions}
        currentVersionId={currentVersion}
        onVersionSelect={handleVersionSelect}
        versionDisabled={!isAuthed}
      />
      <InfoBar
        nickname={nickname}
        connected={connected}
        roomCode={bossMode ? undefined : room?.code}
        roomStatus={room ? roomStatusLabel : undefined}
        actingName={formatGeneralName(actingPlayer)}
        turnName={formatGeneralName(turnPlayer)}
        email={user?.email}
        isAuthed={isAuthed}
        onLoginClick={() => setShowLoginDialog(true)}
        onChangePassword={() => setShowChangePasswordDialog(true)}
        onLogout={() => void logout()}
      />
      {isPlaying && room && (
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
                  ? `请切换操控到「${turnPlayer?.nickname}」再出牌`
                  : turnPlayer?.id === playerId
                    ? '等待你的回合'
                    : `当前回合：${turnPlayer?.nickname}`
            : onLobbySheet
              ? isAuthed
                ? '大厅聊天或 /create · /join 房间号 · /version 版本号'
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
            : room && !bossMode && !isPlaying
              ? styles.mainWithChat
              : styles.main
        }
      >
        {displaySheet === GAME_SHEET_ID && room ? (
          <GameGrid
            room={room}
            chatMessages={chatMessages}
            playerId={playerId}
            actingPlayerId={actingId}
            selectedCell={selectedCell}
            selectedHand={selectedHand}
            onSelectCell={setSelectedCell}
          onSelectHand={handleSelectHand}
          onPlayCard={handlePlayCard}
          onViewSkills={setSkillModalPlayer}
          onViewCard={setDetailCardName}
        />
        ) : displaySheet === 'sheet1' ? (
          <>
            <div className={gridStyles.gridPane}>
              <RoomListGrid
                rooms={roomList}
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                onJoinRoom={(code) => requireAuth(() => joinRoom(code))}
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
                canSend={isAuthed}
                onSend={sendLobbyChat}
              />
            )}
          </>
        ) : (
          <DecoyGrid selectedCell={selectedCell} onSelectCell={setSelectedCell} />
        )}
        {room && !bossMode && !isPlaying && (
          <ChatPanel messages={chatMessages} visible />
        )}
      </div>
      <SheetTabs
        active={displaySheet}
        onSelect={setActiveSheet}
        showGame={!!room}
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
          onZhihengConfirm={(indices) => sandboxZhihengConfirm(indices)}
          onModifyJudge={(pid, idx) => sandboxModifyJudge(pid, idx)}
          onSkipModifyJudge={(pid) => sandboxSkipModifyJudge(pid)}
          onDiscardCards={(pid, indices) => sandboxDiscardCards(pid, indices)}
          onSelectZoneCard={(pid, choiceId) => sandboxSelectZoneCard(pid, choiceId)}
        />
      )}
    </div>
  );
}

export default App;
