import { Room } from '@tk/shared';
import type { ChatMessage, GameType } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { BattleGrid } from './BattleGrid';
import { GeneralSelectPanel } from './GeneralSelectPanel';
import { LobbyGrid } from './LobbyGrid';
import { MonopolyGrid } from './MonopolyGrid';
import gridStyles from './SpreadsheetGrid.module.css';

interface GameGridProps {
  room: Room;
  chatMessages: ChatMessage[];
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedHand: HandCardPick | null;
  showMonopolyCellColors?: boolean;
  onSelectCell: (ref: string) => void;
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onViewSkills: (player: import('@tk/shared').RoomPlayer) => void;
  onViewProfile?: (player: import('@tk/shared').RoomPlayer) => void;
  onViewChatProfile?: (message: ChatMessage) => void;
  onViewCard: (cardName: string) => void;
  onSendChat: (content: string) => void;
  onMonopolyRoll?: () => void;
  onMonopolyBuy?: () => void;
  onMonopolyUpgrade?: () => void;
  onMonopolySkip?: () => void;
  isSandbox?: boolean;
  onToggleReady?: () => void;
  onSelectGeneral?: (generalId: string) => void;
  onSwitchGame?: (gameType?: GameType) => void;
}

export function GameGrid({
  room,
  chatMessages,
  playerId,
  actingPlayerId,
  selectedCell,
  selectedHand,
  showMonopolyCellColors = false,
  onSelectCell,
  onSelectHand,
  onPlayCard,
  onViewSkills,
  onViewProfile,
  onViewChatProfile,
  onViewCard,
  onSendChat,
  onMonopolyRoll,
  onMonopolyBuy,
  onMonopolyUpgrade,
  onMonopolySkip,
  isSandbox = false,
  onToggleReady,
  onSelectGeneral,
  onSwitchGame,
}: GameGridProps) {
  if (room.gameType === 'monopoly' && room.status === 'playing') {
    return (
      <div className={gridStyles.gridPane}>
        <MonopolyGrid
          room={room}
          chatMessages={chatMessages}
          playerId={playerId}
          selectedCell={selectedCell}
          showCellColors={showMonopolyCellColors}
          onSelectCell={onSelectCell}
          onRoll={onMonopolyRoll ?? (() => undefined)}
          onBuy={onMonopolyBuy ?? (() => undefined)}
          onUpgrade={onMonopolyUpgrade ?? (() => undefined)}
          onSkip={onMonopolySkip ?? (() => undefined)}
          onViewProfile={onViewProfile}
          onViewChatProfile={onViewChatProfile}
          onSendChat={onSendChat}
        />
      </div>
    );
  }

  if (room.status === 'playing') {
    return (
      <BattleGrid
        room={room}
        chatMessages={chatMessages}
        playerId={playerId}
        actingPlayerId={actingPlayerId}
        selectedCell={selectedCell}
        selectedHand={selectedHand}
        onSelectCell={onSelectCell}
        onSelectHand={onSelectHand}
        onPlayCard={onPlayCard}
        onViewSkills={onViewSkills}
        onViewProfile={onViewProfile}
        onViewChatProfile={onViewChatProfile}
        onViewCard={onViewCard}
        onSendChat={onSendChat}
      />
    );
  }

  if (room.status === 'selecting' && !isSandbox) {
    return (
      <div className={gridStyles.gridPane}>
        <GeneralSelectPanel
          room={room}
          playerId={playerId}
          onSelectGeneral={onSelectGeneral ?? (() => undefined)}
        />
      </div>
    );
  }

  return (
    <div className={gridStyles.gridPane}>
      <LobbyGrid
        room={room}
        playerId={playerId}
        selectedCell={selectedCell}
        onSelectCell={onSelectCell}
        isSandbox={isSandbox}
        onToggleReady={onToggleReady}
        onViewProfile={onViewProfile}
        onSwitchGame={onSwitchGame}
      />
    </div>
  );
}
