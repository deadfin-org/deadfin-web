import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import {
  addVirtualFolder,
  collectionTypeLabel,
  enabledPlugins,
  move,
  orderedPlugins,
  refreshLibrary,
  withTypeOptions,
} from '../src/api/admin/libraries';
import { folderSpace, readableSize } from '../src/api/admin/system';
import { duration, lastRan, tasksByCategory, triggerLimit, triggerName } from '../src/api/admin/tasks';
import { fetchDevices, fetchMediaFolders, groupRatings, lastSeen, ratingIndex, timeAgo, updatePassword } from '../src/api/admin/users';

afterEach(() => vi.unstubAllGlobals());

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

/** Records each request and answers from `answer`. */
function record(answer: (r: Request) => Response | Promise<Response> = () => new Response(null, { status: 204 })) {
  const seen: { method: string; url: URL; body: string }[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = input instanceof Request ? input : new Request(String(input), init);
    seen.push({ method: r.method, url: new URL(r.url), body: await r.clone().text() });
    return answer(r);
  });
  return seen;
}

describe('scheduled task words', () => {
  it('names triggers as jellyfin-web', () => {
    expect(triggerName({ Type: 'IntervalTrigger', IntervalTicks: 432_000_000_000 })).toBe('Every 12 hours');
    expect(triggerName({ Type: 'IntervalTrigger', IntervalTicks: 36_000_000_000 })).toBe('Every hour');
    expect(triggerName({ Type: 'IntervalTrigger', IntervalTicks: 9_000_000_000 })).toBe('Every 15 minutes');
    expect(triggerName({ Type: 'StartupTrigger' })).toBe('On application startup');
    expect(triggerName({ Type: 'DailyTrigger', TimeOfDayTicks: 0 })).toMatch(/^Daily at 12:00/);
    expect(triggerName({ Type: 'WeeklyTrigger', DayOfWeek: 'Sunday', TimeOfDayTicks: 108_000_000_000 })).toMatch(/^Sundays at 3:00/);
    expect(triggerLimit({ Type: 'StartupTrigger', MaxRuntimeTicks: 72_000_000_000 })).toBe('Time limit: 2 hours');
    expect(triggerLimit({ Type: 'StartupTrigger' })).toBeNull();
  });

  it('groups tasks by category, both sorted', () => {
    const groups = tasksByCategory([
      { Name: 'Scan Media Library', Category: 'Library' },
      { Name: 'Clean Cache', Category: 'Maintenance' },
      { Name: 'Extract Chapter Images', Category: 'Library' },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Library', 'Maintenance']);
    expect(groups[0]!.tasks.map((t) => t.Name)).toEqual(['Extract Chapter Images', 'Scan Media Library']);
  });

  it('reports the last run and its fault', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    const r = lastRan(
      {
        LastExecutionResult: {
          StartTimeUtc: '2026-10-19T09:57:00Z',
          EndTimeUtc: '2026-10-19T10:00:00Z',
          Status: 'Failed',
        },
      },
      now,
    );
    expect(r).toEqual({ text: 'Last ran 2 hours ago, taking 3 minutes.', fault: 'Failed' });
    expect(lastRan({}, now)).toBeNull();
    expect(duration(10_000)).toBe('less than a minute');
  });
});

describe('user helpers', () => {
  const ratings = [
    { Name: 'G', RatingScore: { score: 0 } },
    { Name: 'PG', RatingScore: { score: 10 } },
    { Name: 'TV-PG', RatingScore: { score: 10 } },
    { Name: 'R', RatingScore: { score: 17 } },
  ];

  it('folds ratings with the same score and finds the policy limit', () => {
    const g = groupRatings(ratings);
    expect(g.map((r) => r.Name)).toEqual(['G', 'PG/TV-PG', 'R']);
    expect(ratingIndex(g, { MaxParentalRating: 10 } as never)).toBe(1);
    expect(ratingIndex(g, { MaxParentalRating: 15 } as never)).toBe(1);
    expect(ratingIndex(g, { MaxParentalRating: null } as never)).toBe(-1);
  });

  it('says when a user was last seen', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(lastSeen('2026-10-19T11:55:00Z', now)).toBe('Last activity 5 minutes ago');
    expect(lastSeen(null, now)).toBe('');
    expect(timeAgo(3 * 24 * 3600_000)).toBe('3 days ago');
  });

  it('treats a missing /Devices endpoint as no device list', async () => {
    record(() => json({}, 404));
    expect(await fetchDevices(createApi('http://s', 'tok'))).toBeNull();
  });

  it('lists libraries from /Library/VirtualFolders, MediaFolders only as fallback', async () => {
    record((r) =>
      new URL(r.url).pathname === '/Library/VirtualFolders'
        ? json([{ Name: 'Movies', ItemId: 'lib1' }])
        : json({ Items: [{ Name: 'Playlists', Id: 'pl' }] }),
    );
    expect(await fetchMediaFolders(createApi('http://s', 'tok'))).toEqual([{ Id: 'lib1', Name: 'Movies' }]);
    record((r) =>
      new URL(r.url).pathname === '/Library/VirtualFolders' ? json([]) : json({ Items: [{ Name: 'Movies', Id: 'm' }] }),
    );
    expect(await fetchMediaFolders(createApi('http://s', 'tok'))).toEqual([{ Id: 'm', Name: 'Movies' }]);
  });

  it('sends a password change to /Users/Password with the user id', async () => {
    const seen = record();
    await updatePassword(createApi('http://s', 'tok'), 'u2', { CurrentPw: '', NewPw: 'x' });
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url.pathname).toBe('/Users/Password');
    expect(seen[0]!.url.searchParams.get('userId')).toBe('u2');
    expect(JSON.parse(seen[0]!.body)).toEqual({ CurrentPw: '', NewPw: 'x' });
  });
});

describe('library helpers', () => {
  it('uses jellyfin-web content type words', () => {
    expect(collectionTypeLabel('tvshows')).toBe('Shows');
    expect(collectionTypeLabel(null)).toBe('Mixed Movies and Shows');
    expect(collectionTypeLabel('boxsets')).toBe('Other');
  });

  it('orders plugins by the saved order, then server order', () => {
    const plugins = [{ Name: 'A', DefaultEnabled: true }, { Name: 'B' }, { Name: 'C', DefaultEnabled: true }];
    expect(orderedPlugins(plugins, ['C', 'A']).map((p) => p.Name)).toEqual(['C', 'A', 'B']);
    expect(enabledPlugins(plugins, null)).toEqual(['A', 'C']);
    expect(enabledPlugins(plugins, [])).toEqual([]);
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('sets per-type options without dropping other types', () => {
    const o = withTypeOptions({ TypeOptions: [{ Type: 'Movie', ImageFetchers: ['X'] }] } as never, 'Movie', { MetadataFetchers: ['Y'] });
    expect(o.TypeOptions).toEqual([{ Type: 'Movie', ImageFetchers: ['X'], MetadataFetchers: ['Y'] }]);
    const o2 = withTypeOptions(o, 'Series', { MetadataFetchers: [] });
    expect(o2.TypeOptions?.map((t) => t.Type)).toEqual(['Movie', 'Series']);
  });

  it('adds a library with its folders in the options', async () => {
    const seen = record();
    await addVirtualFolder(createApi('http://s', 'tok'), {
      name: 'Films',
      type: 'mixed',
      paths: ['/media/a', '/media/b'],
      options: { Enabled: true } as never,
    });
    const q = seen[0]!.url.searchParams;
    expect(q.get('name')).toBe('Films');
    expect(q.has('collectionType')).toBe(false);
    expect(q.get('refreshLibrary')).toBe('true');
    expect(JSON.parse(seen[0]!.body).LibraryOptions.PathInfos).toEqual([{ Path: '/media/a' }, { Path: '/media/b' }]);
  });

  it('scans one library in the chosen refresh mode', async () => {
    const seen = record();
    const api = createApi('http://s', 'tok');
    await refreshLibrary(api, 'lib1', 'scan', true);
    await refreshLibrary(api, 'lib1', 'all', true);
    expect(seen[0]!.url.pathname).toBe('/Items/lib1/Refresh');
    expect(Object.fromEntries(seen[0]!.url.searchParams)).toMatchObject({
      metadataRefreshMode: 'Default',
      replaceAllMetadata: 'false',
      replaceAllImages: 'false',
    });
    expect(Object.fromEntries(seen[1]!.url.searchParams)).toMatchObject({
      metadataRefreshMode: 'FullRefresh',
      replaceAllMetadata: 'true',
      replaceAllImages: 'true',
    });
  });
});

describe('storage', () => {
  it('computes used space and readable sizes', () => {
    expect(folderSpace({ Path: '/c', UsedSpace: 75, FreeSpace: 25 })).toEqual({ used: 75, total: 100, percent: 75 });
    expect(folderSpace({ Path: '/c', UsedSpace: -1 })).toEqual({ used: null, total: null, percent: 0 });
    expect(readableSize(1536)).toBe('1.5 KB');
    expect(readableSize(5 * 1024 ** 3)).toBe('5.0 GB');
  });
});
