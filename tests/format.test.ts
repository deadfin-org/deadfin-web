import { describe, expect, it } from 'vitest';
import { formatRemaining, formatRuntime, progressPercent, TICKS_PER_SECOND } from '../src/lib/format';

const MIN = 60 * TICKS_PER_SECOND;

describe('formatRuntime', () => {
  it('is empty for missing/zero/negative', () => {
    expect(formatRuntime(undefined)).toBe('');
    expect(formatRuntime(null)).toBe('');
    expect(formatRuntime(0)).toBe('');
    expect(formatRuntime(-5)).toBe('');
  });
  it('shows sub-minute runtimes honestly', () => {
    expect(formatRuntime(3 * TICKS_PER_SECOND)).toBe('<1m');
  });
  it('formats minutes and hours', () => {
    expect(formatRuntime(54 * MIN)).toBe('54m');
    expect(formatRuntime(134 * MIN)).toBe('2h 14m');
    expect(formatRuntime(60 * MIN)).toBe('1h 0m');
  });
});

describe('progressPercent', () => {
  it('is 0 when either side is unusable', () => {
    expect(progressPercent(undefined, 100)).toBe(0);
    expect(progressPercent(50, null)).toBe(0);
    expect(progressPercent(0, 100)).toBe(0);
  });
  it('computes and clamps', () => {
    expect(progressPercent(40, 100)).toBe(40);
    expect(progressPercent(150, 100)).toBe(100);
  });
});

describe('formatRemaining', () => {
  it('is empty when done or unknown', () => {
    expect(formatRemaining(null, 100 * MIN)).toBe('');
    expect(formatRemaining(100 * MIN, 100 * MIN)).toBe('');
  });
  it('reports the remainder', () => {
    expect(formatRemaining(30 * MIN, 100 * MIN)).toBe('1h 10m remaining');
  });
});
