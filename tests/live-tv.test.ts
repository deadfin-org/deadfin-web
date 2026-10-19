import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import {
  displayUrl,
  fetchChannelMappingOptions,
  fetchLiveTvOptions,
  fetchRefreshGuideTask,
  fetchSchedulesDirectCountries,
  fetchTunerGroups,
  filterLists,
  initialFilter,
  keptChannels,
  saveTunerHost,
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
  it('reads the livetv configuration', async () => {
    vi.stubGlobal('fetch', async (request: Request) => {
      expect(request.url).toBe('http://s/System/Configuration/livetv');
      return json({ TunerHosts: [{ Id: 'a', Type: 'm3u' }], GuideDays: 7 });
    });
    expect(await fetchLiveTvOptions(createApi('http://s', 'tok'))).toEqual({ TunerHosts: [{ Id: 'a', Type: 'm3u' }], GuideDays: 7 });
  });

  it('explains a 403', async () => {
    vi.stubGlobal('fetch', async () => json({}, 403));
    await expect(fetchLiveTvOptions(createApi('http://s', 'tok'))).rejects.toThrow('administrator');
  });

  it('says so when the server has no Live TV', async () => {
    vi.stubGlobal('fetch', async () => json({}, 404));
    await expect(fetchLiveTvOptions(createApi('http://s', 'tok'))).rejects.toThrow('This server has no Live TV settings.');
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

  it('saves the stored tuner with the form on top', async () => {
    let body: unknown;
    vi.stubGlobal('fetch', async (request: Request) => {
      body = await request.json();
      return json(body);
    });
    const stored: TunerHost = { Id: 'a', Type: 'm3u', Url: 'http://p/list.m3u', TunerCount: 5, ExcludeGroups: ['Old'], StreamOpenIntervalMs: 500 };
    await saveTunerHost(createApi('http://s', 'tok'), stored, { Id: 'a', Type: 'm3u', Url: 'http://p/new.m3u', TunerCount: 2 });
    expect(body).toEqual({ Id: 'a', Type: 'm3u', Url: 'http://p/new.m3u', TunerCount: 2, ExcludeGroups: ['Old'], StreamOpenIntervalMs: 500 });
  });

  it('finds the Refresh Guide task among the visible tasks', async () => {
    let url = '';
    vi.stubGlobal('fetch', async (request: Request) => {
      url = request.url;
      return json([{ Id: '1', Key: 'CleanLogFiles' }, { Id: '2', Key: 'RefreshGuide', State: 'Idle' }]);
    });
    expect((await fetchRefreshGuideTask(createApi('http://s', 'tok')))?.Id).toBe('2');
    expect(url).toBe('http://s/ScheduledTasks?isHidden=false');
  });

  it('lists Schedules Direct countries by name, without region ZZZ', async () => {
    vi.stubGlobal('fetch', async () =>
      json({
        'North America': [{ fullName: 'United States', shortName: 'USA' }, { fullName: 'Canada', shortName: 'CAN' }],
        ZZZ: [{ fullName: 'Test', shortName: 'ZZZ' }],
      }),
    );
    expect(await fetchSchedulesDirectCountries(createApi('http://s', 'tok'))).toEqual([
      { name: 'Canada', value: 'CAN' },
      { name: 'United States', value: 'USA' },
    ]);
  });

  it('reads the channel mapping options', async () => {
    vi.stubGlobal('fetch', async (request: Request) => {
      expect(request.url).toBe('http://s/LiveTv/ChannelMappingOptions?providerId=p1');
      return json({ TunerChannels: [{ Id: 'c', Name: 'One' }], ProviderChannels: [{ Id: 'g', Name: 'Guide One' }], ProviderName: 'XmlTV' });
    });
    expect(await fetchChannelMappingOptions(createApi('http://s', 'tok'), 'p1')).toEqual({
      TunerChannels: [{ Id: 'c', Name: 'One' }],
      ProviderChannels: [{ Id: 'g', Name: 'Guide One' }],
      ProviderName: 'XmlTV',
    });
  });
});

describe('displayUrl', () => {
  it('hides the query, which holds playlist credentials', () => {
    expect(displayUrl('https://panel.example/get.php?username=u&password=p&type=m3u')).toBe('https://panel.example/get.php?…');
    expect(displayUrl('http://p/list.m3u')).toBe('http://p/list.m3u');
    expect(displayUrl('/media/list.m3u')).toBe('/media/list.m3u');
    expect(displayUrl(null)).toBe('');
  });
});
