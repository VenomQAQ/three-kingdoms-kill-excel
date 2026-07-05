import { describe, expect, it } from 'vitest';
import { VersionDetailService } from './version-detail.service';

describe('VersionDetailService', () => {
  it('returns read-only standard version detail from registries', () => {
    const service = new VersionDetailService();

    const detail = service.getVersionDetail('standard-2014');

    expect(detail).toMatchObject({
      id: 'standard-2014',
      name: '三国杀标准版·界限突破',
      minPlayers: 2,
      maxPlayers: 8,
      readOnly: true,
      _v: 1,
    });
    expect(detail?.generals.length).toBeGreaterThanOrEqual(30);
    expect(detail?.generals[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String), hp: expect.any(Number) }),
    );
    expect(detail?.cards.basic).toContain('杀');
    expect(detail?.cards.trick).toContain('闪电');
    expect(detail?.cards.equipment).toContain('诸葛连弩');
  });

  it('returns null for unknown versions', () => {
    const service = new VersionDetailService();

    expect(service.getVersionDetail('future-version')).toBeNull();
  });
});
