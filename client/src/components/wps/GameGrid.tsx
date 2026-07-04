import { Room } from '@tk/shared';
import type { ChatMessage } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { BattleGrid } from './BattleGrid';
import { GeneralSelectPanel } from './GeneralSelectPanel';
import { LobbyGrid } from './LobbyGrid';
import gridStyles from './SpreadsheetGrid.module.css';

interface GameGridProps {
  room: Room;
  chatMessages: ChatMessage[];
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedHand: HandCardPick | null;
  onSelectCell: (ref: string) => void;
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onViewSkills: (player: import('@tk/shared').RoomPlayer) => void;
  onViewCard: (cardName: string) => void;
  onSendChat: (content: string) => void;
  isSandbox?: boolean;
  onToggleReady?: () => void;
  onSelectGeneral?: (generalId: string) => void;
}

export function GameGrid({
  room,
  chatMessages,
  playerId,
  actingPlayerId,
  selectedCell,
  selectedHand,
  onSelectCell,
  onSelectHand,
  onPlayCard,
  onViewSkills,
  onViewCard,
  onSendChat,
  isSandbox = false,
  onToggleReady,
  onSelectGeneral,
}: GameGridProps) {
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
      />
    </div>
  );
}
