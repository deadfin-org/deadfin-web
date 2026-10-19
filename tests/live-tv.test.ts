import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import {
  fetchM3UTuners,
  fetchTunerGroups,
  filterLists,
  initialFilter,
  keptChannels,
  saveTunerFilter,
  type TunerHost,
} from '../src/api/liveTv';

afterEach(() => vi.unstubAllGlobals());

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

const groups = [
  { Name: 'News', Count: 9 },
  { Name: 'Sports', Count: 2 },
  { Name: '', Count: 1 },
];

describe('group filter state', () => {
  it('starts from the stored lists', () => {
    expect(initialFilter({ Id: 't', IncludeGroups: ['News'], ExcludeGroups: ['Kids'] })).toEqual({ mode: 'include', selected: ['News'] });
    expect(initialFilter({ Id: 't', IncludeGroups: [], ExcludeGroups: ['Kids'] })).toEqual({ mode: 'exclude', selected: ['Kids'] });
    expect(initialFilter({ Id: 't' })).toEqual({ mode: 'all', selected: [] });
  });

  it('always sends both lists', () => {
    expect(filterLists('include', ['News'])).toEqual({ IncludeGroups: ['News'], ExcludeGroups: [] });
    expect(filterLists('exclude', ['News'])).toEqual({ IncludeGroups: [], ExcludeGroups: ['News'] });
    expect(filterLists('all', ['News'])).toEqual({ IncludeGroups: [], ExcludeGroups: [] });
  });

  it('counts the kept channels, ignoring case', () => {
    expect(keptChannels(groups, 'all', [])).toBe(12);
    expect(keptChannels(groups, 'include', [' news'])).toBe(9);
    expect(keptChannels(groups, 'exclude', ['NEWS', ''])).toBe(2);
  });
});

describe('live tv api', () => {
  it('lists only M3U tuners', async () => {
    vi.stubGlobal('fetch', async () =>
      json({ TunerHosts: [{ Id: 'a', Type: 'm3u' }, { Id: 'b', Type: 'hdhomerun' }, { Type: 'm3u' }] }),
    );
    expect(await fetchM3UTuners(createApi('http://s', 'tok'))).toEqual([{ Id: 'a', Type: 'm3u' }]);
  });

  it('explains a 403', async () => {
    vi.stubGlobal('fetch', async () => json({}, 403));
    await expect(fetchM3UTuners(createApi('http://s', 'tok'))).rejects.toThrow('administrator');
  });

  it('reads the groups with the session token', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const result = await fetchTunerGroups('http://s', 'tok', 'a b', async (input, init) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') });
      return json({ Groups: groups, Loaded: true });
    });
    expect(result).toEqual({ Groups: groups, Loaded: true });
    expect(seen[0]?.url).toBe('http://s/deadfin/v1/livetv/tunerhosts/a%20b/groups');
    expect(seen[0]?.auth).toContain('Token="tok"');
  });

  it('saves the whole tuner with both lists', async () => {
    let body: unknown;
    vi.stubGlobal('fetch', async (request: Request) => {
      body = await request.json();
      return json(body);
    });
    const tuner: TunerHost = { Id: 'a', Type: 'm3u', Url: 'http://p/list.m3u', TunerCount: 5, IncludeGroups: ['Old'] };
    await saveTunerFilter(createApi('http://s', 'tok'), tuner, 'exclude', ['News']);
    expect(body).toEqual({ Id: 'a', Type: 'm3u', Url: 'http://p/list.m3u', TunerCount: 5, IncludeGroups: [], ExcludeGroups: ['News'] });
  });
});
