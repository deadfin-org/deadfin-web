import { describe, expect, it } from 'vitest';
import { episodeLabel, pickSeason, playNextTarget, playUrl } from '../src/api/tv';
import type { BaseItem } from '../src/api/library';

const item = (o: object) => o as BaseItem;

describe('episodeLabel', () => {
  it.each([
    [{ ParentIndexNumber: 1, IndexNumber: 2 }, 'S1:E2'],
    [{ ParentIndexNumber: 0, IndexNumber: 1 }, 'Special'],
    [{ IndexNumber: 3 }, 'E3'],
    [{}, ''],
  ])('%o → %s', (item, expected) => {
    expect(episodeLabel(item)).toBe(expected);
  });
});

describe('pickSeason', () => {
  const specials = item({ Id: 's0', IndexNumber: 0, UserData: { UnplayedItemCount: 1 } });
  const s1 = item({ Id: 's1', IndexNumber: 1, UserData: { UnplayedItemCount: 0 } });
  const s2 = item({ Id: 's2', IndexNumber: 2, UserData: { UnplayedItemCount: 4 } });
  it('honours the requested season', () => {
    expect(pickSeason([specials, s1, s2], 's0')?.Id).toBe('s0');
  });
  it('opens the first regular season with unplayed episodes', () => {
    expect(pickSeason([specials, s1, s2])?.Id).toBe('s2');
  });
  it('falls back to the first regular season, then to specials', () => {
    expect(pickSeason([specials, s1])?.Id).toBe('s1');
    expect(pickSeason([specials])?.Id).toBe('s0');
    expect(pickSeason([])).toBeUndefined();
  });
  it('ignores an unknown requested season', () => {
    expect(pickSeason([s1, s2], 'gone')?.Id).toBe('s2');
  });
});

describe('playNextTarget and playUrl', () => {
  const e1 = item({ Id: 'e1', UserData: { Played: true } });
  const e2 = item({ Id: 'e2', UserData: { Played: false, PlaybackPositionTicks: 30_000_000 } });
  it('prefers Next Up, else the first unplayed episode', () => {
    expect(playNextTarget(item({ Id: 'nu' }), [e1, e2])?.Id).toBe('nu');
    expect(playNextTarget(undefined, [e1, e2])?.Id).toBe('e2');
    expect(playNextTarget(undefined, [e1])?.Id).toBe('e1');
  });
  it('resumes a part-watched episode', () => {
    expect(playUrl(e2)).toBe('/video?id=e2&t=30000000');
    expect(playUrl(e1)).toBe('/video?id=e1');
  });
});
