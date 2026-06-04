import { Room } from '@tk/shared';
import type { HandCardPick } from '../../types/hand';
import { BattleGrid } from './BattleGrid';
import { LobbyGrid } from './LobbyGrid';

interface GameGridProps {
  room: Room;
  playerId: string | null;
  actingPlayerId: string | null;
  selectedCell: string;
  selectedHand: HandCardPick | null;
  onSelectCell: (ref: string) => void;
  onSelectHand: (card: string, index: number) => void;
  onPlayCard: (card: string, handIndex?: number) => void;
  onViewSkills: (player: import('@tk/shared').RoomPlayer) => void;
}

export function GameGrid({
  room,
  playerId,
  actingPlayerId,
  selectedCell,
  selectedHand,
  onSelectCell,
  onSelectHand,
  onPlayCard,
  onViewSkills,
}: GameGridProps) {
  if (room.status === 'playing') {
    return (
      <BattleGrid
        room={room}
        playerId={playerId}
        actingPlayerId={actingPlayerId}
        selectedCell={selectedCell}
        selectedHand={selectedHand}
        onSelectCell={onSelectCell}
        onSelectHand={onSelectHand}
        onPlayCard={onPlayCard}
        onViewSkills={onViewSkills}
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
