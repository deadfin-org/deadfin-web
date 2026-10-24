import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import {
  buildDeviceProfile,
  directStreamUrl,
  getPlaybackInfo,
  needsOpening,
  openLiveStream,
  pickSource,
  probeCapabilities,
  reportStopped,
  transcodeUrl,
} from '../src/api/playback';
import { formatTimecode } from '../src/lib/format';

beforeEach(() => localStorage.clear());

const CHROMIUM_FREE = new Set([
  'video/mp4; codecs="av01.0.08M.08"',
  'audio/mp4; codecs="opus"',
  'audio/mp4; codecs="flac"',
  'video/webm; codecs="vp9, opus"',
  'audio/mpeg',
]);
const CHROME = new Set([
  ...CHROMIUM_FREE,
  'video/mp4; codecs="avc1.640029"',
  'audio/mp4; codecs="mp4a.40.2"',
]);

describe('probeCapabilities', () => {
  it('lists what a browser without proprietary codecs decodes', () => {
    const caps = probeCapabilities((m) => CHROMIUM_FREE.has(m));
    expect(caps.mp4Video).toEqual(['av1']);
    expect(caps.mp4Audio).toEqual(['opus', 'flac']);
    expect(caps.webm).toBe(true);
  });

  it('puts h264 and aac first where the browser has them', () => {
    const caps = probeCapabilities((m) => CHROME.has(m));
    expect(caps.mp4Video[0]).toBe('h264');
    expect(caps.mp4Audio[0]).toBe('aac');
  });
});

describe('buildDeviceProfile', () => {
  it('offers an fMP4 HLS transcode to the codecs the browser decodes', () => {
    const p = buildDeviceProfile(probeCapabilities((m) => CHROMIUM_FREE.has(m)));
    expect(p.TranscodingProfiles).toHaveLength(1);
    expect(p.TranscodingProfiles![0]).toMatchObject({
      Container: 'mp4',
      Protocol: 'hls',
      Type: 'Video',
      VideoCodec: 'av1',
      AudioCodec: 'opus,flac',
    });
    expect(p.DirectPlayProfiles?.some((d) => d.Container === 'webm')).toBe(true);
  });

  it('offers no transcode when the browser decodes no MP4 video', () => {
    const p = buildDeviceProfile(probeCapabilities((m) => m === 'video/webm; codecs="vp9, opus"'));
    expect(p.TranscodingProfiles).toEqual([]);
    expect(p.DirectPlayProfiles?.map((d) => d.Container)).toEqual(['webm']);
  });
});

describe('pickSource', () => {
  it('prefers the first direct-playable source', () => {
    const info = {
      MediaSources: [
        { Id: 'a', SupportsDirectPlay: false, SupportsTranscoding: true, TranscodingUrl: '/t' },
        { Id: 'b', SupportsDirectPlay: true },
      ],
    };
    expect(pickSource(info as never)).toMatchObject({ method: 'DirectPlay', media: { Id: 'b' } });
  });

  it('falls back to a transcode the server offers', () => {
    const info = { MediaSources: [{ Id: 'a', SupportsDirectPlay: false, SupportsTranscoding: true, TranscodingUrl: '/t' }] };
    expect(pickSource(info as never)).toMatchObject({ method: 'Transcode', media: { Id: 'a' } });
  });

  it('is undefined when negotiation offers neither', () => {
    expect(pickSource({ MediaSources: [{ SupportsDirectPlay: false, SupportsTranscoding: false }] } as never)).toBeUndefined();
    expect(pickSource({} as never)).toBeUndefined();
  });
});

describe('transcodeUrl', () => {
  it('joins the server address and keeps the server-issued token', () => {
    const u = new URL(transcodeUrl('http://srv:8096/jf', { TranscodingUrl: '/videos/i1/master.m3u8?ApiKey=abc' } as never, 'tok'));
    expect(u.pathname).toBe('/jf/videos/i1/master.m3u8');
    expect(u.searchParams.get('ApiKey')).toBe('abc');
    expect(u.searchParams.has('api_key')).toBe(false);
  });

  it('adds the token when the server left it out', () => {
    const u = new URL(transcodeUrl('http://srv:8096', { TranscodingUrl: '/videos/i1/master.m3u8?a=1' } as never, 'tok'));
    expect(u.searchParams.get('api_key')).toBe('tok');
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

describe('Live TV streams', () => {
  afterEach(() => vi.unstubAllGlobals());

  function recordRequests() {
    const seen: Request[] = [];
    vi.stubGlobal('fetch', async (req: Request) => {
      seen.push(req.clone());
      const body = req.url.includes('/LiveStreams/Open')
        ? { MediaSource: { Id: 'ms', LiveStreamId: 'ls-1', SupportsTranscoding: true, TranscodingUrl: '/videos/ch/master.m3u8?LiveStreamId=ls-1' } }
        : { MediaSources: [], PlaySessionId: 'ps' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    return seen;
  }

  it('asks PlaybackInfo to open the stream, and names an open stream again', async () => {
    const seen = recordRequests();
    const api = createApi('http://srv', 'tok');
    await getPlaybackInfo(api, 'ch', 'user', {});
    await getPlaybackInfo(api, 'ch', 'user', { liveStreamId: 'ls-1' });
    expect(await seen[0]!.json()).toMatchObject({ AutoOpenLiveStream: true });
    expect(await seen[1]!.json()).toMatchObject({ AutoOpenLiveStream: true, LiveStreamId: 'ls-1' });
  });

  it('needsOpening is true only for a source that requires opening and names no stream', () => {
    expect(needsOpening({ RequiresOpening: true } as never)).toBe(true);
    expect(needsOpening({ RequiresOpening: true, LiveStreamId: 'ls-1' } as never)).toBe(false);
    expect(needsOpening({ RequiresOpening: false } as never)).toBe(false);
  });

  it('opens the stream with its OpenToken and returns the opened source', async () => {
    const seen = recordRequests();
    const api = createApi('http://srv', 'tok');
    const opened = await openLiveStream(api, 'ch', 'user', { OpenToken: 'tok-1', RequiresOpening: true } as never, 'ps');
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe('/LiveStreams/Open');
    expect(url.searchParams.get('openToken')).toBe('tok-1');
    expect(url.searchParams.get('playSessionId')).toBe('ps');
    expect(await seen[0]!.json()).toMatchObject({ OpenToken: 'tok-1', ItemId: 'ch', PlaySessionId: 'ps' });
    expect(opened.LiveStreamId).toBe('ls-1');
    expect(needsOpening(opened)).toBe(false);
  });

  it('names the live stream in the stop report so the server closes it', async () => {
    const seen = recordRequests();
    reportStopped({ api: createApi('http://srv', 'tok'), itemId: 'ch', liveStreamId: 'ls-1' }, 0);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(await seen[0]!.json()).toMatchObject({ LiveStreamId: 'ls-1' });
  });
});
