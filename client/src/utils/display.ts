import { CharacterRegistry } from '@tk/engine';
import type { GamePrompt, Room, RoomPlayer } from '@tk/shared';

export function stripGeneralPrefix(name?: string | null): string {
  if (!name) return '';
  return name.replace(/^\u754c/, '');
}

export function stripGeneralPrefixInText(text?: string | null): string {
  if (!text) return '';
  return text.replace(/(^|[^\u4e00-\u9fa5])\u754c(?=[\u4e00-\u9fa5]{2,3})/g, '$1');
}

export function formatGeneralName(
  player?: Partial<Pick<RoomPlayer, 'general' | 'nickname'>> | null,
): string {
  return stripGeneralPrefix(player?.general ?? player?.nickname ?? '');
}

export function formatPlayerName(player: Pick<RoomPlayer, 'nickname' | 'isVirtual'>, isHost = false): string {
  const virtualSuffix = player.isVirtual ? ' (虚拟)' : '';
  return `${isHost ? '[房主]' : ''}${player.nickname}${virtualSuffix}`;
}

export function formatKingdomName(kingdom?: string | null): string {
  switch (kingdom) {
    case 'wei':
      return '魏';
    case 'shu':
      return '蜀';
    case 'wu':
      return '吴';
    case 'qun':
      return '群';
    default:
      return '—';
  }
}

export function formatRoleName(player?: Pick<RoomPlayer, 'role' | 'roleRevealed'> | null): string {
  if (!player?.role) return '?';
  // 服务端 filterRoomForPlayer 已按视角过滤：本人可见真实身份，他人未公开则为「？」
  if (player.role === '？') return '?';
  return player.role;
}

export function formatCharacterLine(player?: Partial<RoomPlayer> | null): string {
  const general = formatGeneralName(player);
  if (!general) return '—';
  const character = CharacterRegistry.resolve(player?.general ?? player?.nickname ?? '');
  return `${formatKingdomName(character?.kingdom)}-${general}【${formatRoleName(player)}】`;
}

export function toChineseCount(count: number): string {
  const labels = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return labels[count] ?? String(count);
}

function sanitizePrompt(prompt: GamePrompt | null | undefined): GamePrompt | null | undefined {
  if (!prompt) return prompt;
  return {
    ...prompt,
    cardName: stripGeneralPrefixInText(prompt.cardName),
    skillName: stripGeneralPrefixInText(prompt.skillName),
    judgeCardName: stripGeneralPrefixInText(prompt.judgeCardName),
    judgeResult: stripGeneralPrefixInText(prompt.judgeResult),
    message: stripGeneralPrefixInText(prompt.message),
    zoneCardOptions: prompt.zoneCardOptions?.map((option) => ({
      ...option,
      label: stripGeneralPrefixInText(option.label),
    })),
    skillCardOptions: prompt.skillCardOptions?.map((option) => ({
      ...option,
      label: stripGeneralPrefixInText(option.label),
    })),
    characterSkills: prompt.characterSkills?.map((skill) => ({
      ...skill,
      name: stripGeneralPrefixInText(skill.name),
      description: stripGeneralPrefixInText(skill.description),
    })),
    options: prompt.options?.map((option) => ({
      ...option,
      label: stripGeneralPrefixInText(option.label),
    })),
  };
}

export function sanitizeRoom(room: Room): Room {
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      general: stripGeneralPrefix(player.general),
      nickname: stripGeneralPrefix(player.nickname),
      equipment: player.equipment?.map((card) => stripGeneralPrefixInText(card)),
      judgeCards: player.judgeCards?.map((card) => stripGeneralPrefixInText(card)),
      handCards: player.handCards?.map((card) => stripGeneralPrefixInText(card)),
    })),
    generalSelection: room.generalSelection
      ? {
          ...room.generalSelection,
          myOptions: room.generalSelection.myOptions?.map((option) => ({
            ...option,
            name: stripGeneralPrefix(option.name),
          })),
          selected: room.generalSelection.selected.map((item) => ({
            ...item,
            generalName: stripGeneralPrefix(item.generalName),
          })),
        }
      : room.generalSelection,
    sandbox: room.sandbox
      ? {
          ...room.sandbox,
          log: room.sandbox.log.map((line) => stripGeneralPrefixInText(line)),
          prompt: sanitizePrompt(room.sandbox.prompt),
        }
      : room.sandbox,
  };
}
