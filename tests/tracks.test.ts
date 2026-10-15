import { describe, expect, it } from 'vitest';
import {
  audioTracks,
  defaultAudioIndex,
  defaultSubtitleIndex,
  streamRequestFor,
  subtitleTracks,
  subtitleUrl,
  trackLabel,
} from '../src/api/tracks';
import type { MediaSource } from '../src/api/playback';

const media = {
  Id: 'ms1',
  DefaultAudioStreamIndex: 1,
  DefaultSubtitleStreamIndex: -1,
  MediaStreams: [
    { Index: 0, Type: 'Video', Codec: 'vp9' },
    { Index: 1, Type: 'Audio', Codec: 'opus', Language: 'eng', DisplayTitle: 'English - Opus - Stereo' },
    { Index: 2, Type: 'Audio', Codec: 'opus', Language: 'fre', Title: 'French' },
    { Index: 3, Type: 'Subtitle', Codec: 'subrip', Language: 'eng', IsTextSubtitleStream: true, IsExternal: true,
      DeliveryMethod: 'External', DeliveryUrl: '/Videos/i1/ms1/Subtitles/3/0/Stream.vtt' },
    { Index: 4, Type: 'Subtitle', Codec: 'PGSSUB', Language: 'eng', IsTextSubtitleStream: false },
  ],
} as unknown as MediaSource;

describe('tracks', () => {
  it('lists audio and subtitle streams with readable labels', () => {
    expect(audioTracks(media).map((t) => t.label)).toEqual(['English - Opus - Stereo', 'fre · French · OPUS']);
    expect(subtitleTracks(media).map((t) => [t.index, t.text])).toEqual([[3, true], [4, false]]);
    expect(trackLabel({ Index: 7 } as never)).toBe('Track 7');
  });

  it('reads the server defaults; -1 means subtitles off', () => {
    expect(defaultAudioIndex(media)).toBe(1);
    expect(defaultSubtitleIndex(media)).toBeNull();
    expect(defaultAudioIndex({ ...media, DefaultAudioStreamIndex: null })).toBe(1);
  });

  it('asks the server only for what the browser cannot do itself', () => {
    expect(streamRequestFor(media, 1, null)).toEqual({});
    expect(streamRequestFor(media, 1, 3)).toEqual({});
    expect(streamRequestFor(media, 2, 3)).toEqual({ audioStreamIndex: 2 });
    expect(streamRequestFor(media, 1, 4)).toEqual({ burnSubtitleIndex: 4 });
  });

  it('builds the WebVTT URL from the delivery URL or the stream index', () => {
    const a = new URL(subtitleUrl('http://srv:8096', 'i1', media, 3, 'tok'));
    expect(a.pathname).toBe('/Videos/i1/ms1/Subtitles/3/0/Stream.vtt');
    expect(a.searchParams.get('api_key')).toBe('tok');
    const srt = {
      ...media,
      MediaStreams: [{ Index: 3, Type: 'Subtitle', DeliveryMethod: 'External', DeliveryUrl: '/Videos/i1/ms1/Subtitles/3/0/Stream.srt' }],
    } as unknown as MediaSource;
    expect(new URL(subtitleUrl('http://srv:8096', 'i1', srt, 3, 'tok')).pathname).toMatch(/Stream\.vtt$/);
    const b = new URL(subtitleUrl('http://srv:8096/jf', 'i1', media, 4, 'tok'));
    expect(b.pathname).toBe('/jf/Videos/i1/ms1/Subtitles/4/0/Stream.vtt');
  });
});
