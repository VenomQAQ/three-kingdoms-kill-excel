import { Room } from '@tk/shared';
import { BattleGrid } from './BattleGrid';
import { LobbyGrid } from './LobbyGrid';

interface GameGridProps {
  room: Room;
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedCard: string | null;
  onSelectCell: (ref: string) => void;
  onSelectCard: (card: string) => void;
  onPlayCard: (card: string) => void;
}

export function GameGrid({
  room,
  playerId,
  actingPlayerId,
  selectedCell,
  selectedCard,
  onSelectCell,
  onSelectCard,
  onPlayCard,
}: GameGridProps) {
  if (room.status === 'playing') {
    return (
      <BattleGrid
        room={room}
        playerId={playerId}
        actingPlayerId={actingPlayerId}
        selectedCell={selectedCell}
        selectedCard={selectedCard}
        onSelectCell={onSelectCell}
        onSelectCard={onSelectCard}
        onPlayCard={onPlayCard}
      />
    );
  }

  return (
    <LobbyGrid
      room={room}
      playerId={playerId}
      selectedCell={selectedCell}
      onSelectCell={onSelectCell}
    />
  );
}
