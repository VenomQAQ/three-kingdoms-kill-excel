import { Injectable } from '@nestjs/common';
import { CardRegistry, CharacterRegistry } from '@tk/engine';
import { findVersion, VersionDetail } from '@tk/shared';

@Injectable()
export class VersionDetailService {
  getVersionDetail(versionId: string): VersionDetail | null {
    const version = findVersion(versionId);
    if (!version) return null;

    const cardsByType = {
      basic: CardRegistry.listByType('basic').map((card) => card.name),
      trick: CardRegistry.listByType('trick').map((card) => card.name),
      equipment: CardRegistry.listByType('equipment').map((card) => card.name),
    };

    return {
      id: version.id,
      name: version.name,
      minPlayers: version.minPlayers,
      maxPlayers: version.maxPlayers,
      generals: CharacterRegistry.getAll().map((general) => ({
        id: general.id,
        name: general.name,
        kingdom: general.kingdom,
        hp: general.maxHp,
      })),
      cards: cardsByType,
      unlockHint: '当前版本默认开放，可直接创建或加入房间。',
      readOnly: true,
      _v: 1,
    };
  }
}
