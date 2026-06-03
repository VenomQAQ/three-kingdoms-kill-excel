import { useCallback, useEffect, useMemo, useState } from 'react';
import { TitleBar } from './components/wps/TitleBar';
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
import {
  DEFAULT_FILE_NAMES,
  GAME_SHEET_ID,
  SANDBOX_ROOM_CODE,
  SheetId,
} from './data/decoy';
import { useAppStore } from './store/appStore';
import styles from './App.module.css';

function App() {
  const [activeSheet, setActiveSheet] = useState<SheetId>('sheet1');
  const [bossMode, setBossMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState('A1');
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [sandboxCharName, setSandboxCharName] = useState('');

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
    sandboxEndTurn,
    sendChat,
    chatMessages,
    lastError,
    clearError,
  } = useAppStore();

  useEffect(() => {
    connect();
  }, [connect]);

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
  const isPlaying = room?.status === 'playing';
  const actingId = actingPlayerId ?? playerId;
  const actingPlayer = room?.players.find((p) => p.id === actingId);
  const turnPlayer =
    room?.sandbox != null && isPlaying
      ? room.players[room.sandbox.turnIndex]
      : null;
  const canOperate =
    isPlaying && turnPlayer != null && actingId === turnPlayer.id;
  const isHost = room?.hostId === playerId;

  const handlePlayCard = useCallback(
    (card: string) => {
      setSelectedCard(card);
      if (isSandbox && canOperate) {
        sandboxPlayCard(card);
      }
    },
    [isSandbox, canOperate, sandboxPlayCard],
  );

  const handleRibbonAction = useCallback(
    async (id: string) => {
      clearError();
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
          setSelectedCard(null);
          break;
        case 'ready':
          toggleReady();
          break;
        case 'start':
          if (isSandbox) sandboxStart();
          else startGame();
          break;
        case 'addChar': {
          const name =
            sandboxCharName.trim() || `角色${(room?.players.length ?? 0) + 1}`;
          sandboxAddPlayer(name, name);
          setSandboxCharName('');
          break;
        }
        case 'removeChar':
          sandboxRemoveLastVirtual();
          break;
        case 'playCard':
          if (selectedCard) handlePlayCard(selectedCard);
          break;
        case 'endTurn':
          sandboxEndTurn();
          setSelectedCard(null);
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
      selectedCard,
      sandboxCharName,
      room,
      actingId,
      isSandbox,
    ],
  );

  const ribbonActions: RibbonAction[] = useMemo(() => {
    const inRoom = !!room;
    const playing = isPlaying;

    if (playing && isSandbox) {
      return [
        {
          id: 'playCard',
          label: '打出',
          icon: '🃏',
          disabled: !canOperate || !selectedCard,
        },
        {
          id: 'endTurn',
          label: '结束回合',
          icon: '⏭',
          disabled: !canOperate,
        },
        {
          id: 'switchNext',
          label: '切换角色',
          icon: '🔄',
        },
        { id: 'leave', label: '离开', icon: '🚪' },
      ];
    }

    const base: RibbonAction[] = [
      { id: 'create', label: '创建房间', icon: '➕', disabled: inRoom },
      { id: 'joinSandbox', label: '测试房', icon: '🧪', disabled: inRoom },
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
  }, [room, isSandbox, isHost, isPlaying, canOperate, selectedCard]);

  const handleFormulaSubmit = useCallback(async () => {
    const raw = formulaInput.trim();
    if (!raw) return;

    clearError();

    if (raw.startsWith('/')) {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(' ');

      switch (cmd.toLowerCase()) {
        case 'nick':
          setNickname(arg || nickname);
          break;
        case 'create':
          await createRoom();
          break;
        case 'join':
          await joinRoom(arg);
          break;
        case 'sandbox':
        case 'test':
          await joinSandbox();
          break;
        case 'leave':
          leaveRoom();
          setActiveSheet('sheet1');
          setSelectedCard(null);
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
          setSelectedCard(null);
          break;
        default:
          if (room) sendChat(raw);
      }
    } else if (isPlaying && isSandbox) {
      handlePlayCard(raw);
    } else if (room) {
      sendChat(raw);
    }

    setFormulaInput('');
  }, [
    formulaInput,
    clearError,
    setNickname,
    nickname,
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
      <Ribbon actions={ribbonActions} onAction={handleRibbonAction} />
      <InfoBar
        nickname={nickname}
        connected={connected}
        roomCode={bossMode ? undefined : room?.code}
        roomStatus={room ? roomStatusLabel : undefined}
        actingName={actingPlayer?.nickname}
        turnName={turnPlayer?.general ?? turnPlayer?.nickname}
      />
      {isPlaying && isSandbox && room && (
        <PlayControlBar
          actingPlayer={actingPlayer}
          turnPlayer={turnPlayer ?? undefined}
          selectedCard={selectedCard}
          canOperate={canOperate}
          players={room.players}
          onSelectCard={setSelectedCard}
          onPlayCard={handlePlayCard}
          onEndTurn={() => {
            sandboxEndTurn();
            setSelectedCard(null);
          }}
          onSwitchActor={(id) => sandboxSwitchActor(id)}
        />
      )}
      {isSandbox && room && !isPlaying && (
        <div className={styles.sandboxInput}>
          <label>
            新角色名
            <input
              value={sandboxCharName}
              onChange={(e) => setSandboxCharName(e.target.value)}
              placeholder="如：刘备"
              onKeyDown={(e) =>
                e.key === 'Enter' && handleRibbonAction('addChar')
              }
            />
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
          isPlaying && isSandbox
            ? canOperate
              ? '输入牌名 Enter 出牌 · 或点击上方手牌 · 「结束回合」按钮结束'
              : `请切换操控到「${turnPlayer?.nickname}」再出牌`
            : room
              ? '聊天或 /ready /start /add 角色名'
              : '/create · /join 房间号 · /sandbox 测试房'
        }
      />
      {lastError && (
        <div className={styles.error} onClick={clearError}>
          {lastError}（点击关闭）
        </div>
      )}
      <div className={styles.main}>
        {displaySheet === GAME_SHEET_ID && room ? (
          <GameGrid
            room={room}
            playerId={playerId}
            actingPlayerId={actingId}
            selectedCell={selectedCell}
            selectedCard={selectedCard}
            onSelectCell={setSelectedCell}
            onSelectCard={setSelectedCard}
            onPlayCard={handlePlayCard}
          />
        ) : displaySheet === 'sheet1' ? (
          <RoomListGrid
            rooms={roomList}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            onJoinRoom={(code) => void joinRoom(code)}
          />
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
    </div>
  );
}

export default App;
