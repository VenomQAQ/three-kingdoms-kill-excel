import { describe, expect, it } from 'vitest';
import {
  formatBossKeyTargetSize,
  imageMatchesBossKeyTarget,
  storedImageMatchesViewport,
} from './bossKeyImageSpec';

describe('bossKeyImageSpec', () => {
  it('formats target size', () => {
    expect(formatBossKeyTargetSize({ width: 1920, height: 1080 })).toBe('1920 × 1080');
  });

  it('matches exact image dimensions only', () => {
    const target = { width: 1440, height: 900 };
    expect(imageMatchesBossKeyTarget(1440, 900, target)).toBe(true);
    expect(imageMatchesBossKeyTarget(1440, 901, target)).toBe(false);
    expect(imageMatchesBossKeyTarget(1920, 1080, target)).toBe(false);
  });

  it('detects stored image viewport mismatch', () => {
    const current = { width: 1920, height: 1080 };
    expect(storedImageMatchesViewport({ width: 1920, height: 1080 }, current)).toBe(true);
    expect(storedImageMatchesViewport({ width: 1440, height: 900 }, current)).toBe(false);
    expect(storedImageMatchesViewport(null, current)).toBe(false);
  });
});
