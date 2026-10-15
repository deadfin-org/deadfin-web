import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import { DEVICE_PROFILE, directStreamUrl, pickDirectPlaySource, reportStopped } from '../src/api/playback';
import { formatTimecode } from '../src/lib/format';

beforeEach(() => localStorage.clear());

describe('DEVICE_PROFILE', () => {
  it('is honest: direct-play only, no transcoding profiles yet', () => {
    expect(DEVICE_PROFILE.TranscodingProfiles).toEqual([]);
    expect(DEVICE_PROFILE.DirectPlayProfiles?.some((p) => p.Container?.includes('webm'))).toBe(true);
  });
});

describe('pickDirectPlaySource', () => {
  it('selects the first direct-playable source', () => {
    const info = {
      MediaSources: [
        { Id: 'a', SupportsDirectPlay: false },
        { Id: 'b', SupportsDirectPlay: true },
        { Id: 'c', SupportsDirectPlay: true },
      ],
    };
    expect(pickDirectPlaySource(info as never)?.Id).toBe('b');
  });
  it('is undefined when negotiation offers none', () => {
    expect(pickDirectPlaySource({ MediaSources: [{ SupportsDirectPlay: false }] } as never)).toBeUndefined();
    expect(pickDirectPlaySource({} as never)).toBeUndefined();
  });
});

describe('directStreamUrl', () => {
  it('builds the static stream URL with container, source, and api_key auth', () => {
    const url = directStreamUrl(
      'http://srv:8096',
      'item1',
      { Id: 'src1', Container: 'webm' } as never,
      'tok123',
    );
    const u = new URL(url);
    expect(u.pathname).toBe('/Videos/item1/stream.webm');
    expect(u.searchParams.get('static')).toBe('true');
    expect(u.searchParams.get('api_key')).toBe('tok123');
    expect(u.searchParams.get('mediaSourceId')).toBe('src1');
    expect(u.searchParams.get('deviceId')).toBeTruthy();
  });
});

describe('formatTimecode', () => {
  it('covers the shapes', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(7.4)).toBe('0:07');
    expect(formatTimecode(754)).toBe('12:34');
    expect(formatTimecode(3723)).toBe('1:02:03');
    expect(formatTimecode(NaN)).toBe('0:00');
    expect(formatTimecode(-3)).toBe('0:00');
  });
});

describe('reportStopped', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the stop report with keepalive so it survives tab close', async () => {
    const seen: Request[] = [];
    vi.stubGlobal('fetch', async (req: Request) => {
      seen.push(req);
      return new Response(null, { status: 204 });
    });
    const api = createApi('http://srv', 'tok');
    reportStopped({ api, itemId: 'item-1', mediaSourceId: 'ms', playSessionId: 'ps' }, 42);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]!.url).toBe('http://srv/Sessions/Playing/Stopped');
    expect(seen[0]!.keepalive).toBe(true);
    expect(await seen[0]!.json()).toMatchObject({ ItemId: 'item-1', PositionTicks: 42, PlaySessionId: 'ps' });
  });

  it('falls back to a plain request when keepalive is refused (cross-origin preflight)', async () => {
    const seen: boolean[] = [];
    vi.stubGlobal('fetch', async (req: Request) => {
      seen.push(req.keepalive);
      if (req.keepalive) throw new TypeError('Preflight request for request with keepalive specified is currently not supported');
      return new Response(null, { status: 204 });
    });
    reportStopped({ api: createApi('http://srv', 'tok'), itemId: 'item-1' }, 42);
    await vi.waitFor(() => expect(seen).toEqual([true, false]));
  });
});
