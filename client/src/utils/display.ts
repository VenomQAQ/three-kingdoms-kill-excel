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
    sandbox: room.sandbox
      ? {
          ...room.sandbox,
          log: room.sandbox.log.map((line) => stripGeneralPrefixInText(line)),
          prompt: sanitizePrompt(room.sandbox.prompt),
        }
      : room.sandbox,
  };
}
