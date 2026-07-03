import { describe, expect, it } from 'vitest';
import { TargetQueue } from './target-queue';

describe('TargetQueue AOE', () => {
  it('按顺序弹出目标', () => {
    const q = new TargetQueue(['a', 'b', 'c']);
    expect(q.peek()).toBe('a');
    q.shift();
    expect(q.peek()).toBe('b');
    q.shift();
    expect(q.peek()).toBe('c');
    q.shift();
    expect(q.isEmpty).toBe(true);
  });

  it('空队列 isEmpty 为 true', () => {
    const q = new TargetQueue([]);
    expect(q.isEmpty).toBe(true);
  });
});
