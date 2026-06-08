import { CHARACTERS } from '../config/characters';
import type { CharacterDefinition } from '../types/skill';

const byId = new Map<string, CharacterDefinition>();
const byNameOrAlias = new Map<string, CharacterDefinition>();

for (const ch of CHARACTERS) {
  byId.set(ch.id, ch);
  byNameOrAlias.set(ch.name, ch);
  for (const alias of ch.aliases ?? []) {
    byNameOrAlias.set(alias, ch);
  }
}

export class CharacterRegistry {
  static getById(id: string): CharacterDefinition | undefined {
    return byId.get(id);
  }

  static resolve(nameOrId: string): CharacterDefinition | undefined {
    const key = nameOrId.trim();
    return byId.get(key) ?? byNameOrAlias.get(key);
  }

  static getAll(): CharacterDefinition[] {
    return [...CHARACTERS];
  }
}
