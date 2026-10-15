import type { components } from './schema';
import type { Api } from './client';
import { deviceId } from './session';

type DeviceProfile = components['schemas']['DeviceProfile'];
export type MediaSource = components['schemas']['MediaSourceInfo'];
export type PlaybackInfo = components['schemas']['PlaybackInfoResponse'];

/** What this browser can decode, as server codec names. */
export interface Capabilities {
  /** Video codecs playable in MP4 (direct play and fMP4 HLS), best transcode target first. */
  mp4Video: string[];
  /** Audio codecs playable in MP4, best transcode target first. */
  mp4Audio: string[];
  webm: boolean;
  mp3: boolean;
  flac: boolean;
}

/* MIME probes per server codec name. Order is transcode preference:
   h264 is cheapest to encode; av1 covers browsers without proprietary
   codecs (Playwright's Chromium, some Linux builds). */
const VIDEO_PROBES: [string, string][] = [
  ['h264', 'video/mp4; codecs="avc1.640029"'],
  ['hevc', 'video/mp4; codecs="hvc1.1.6.L120.90"'],
  ['av1', 'video/mp4; codecs="av01.0.08M.08"'],
];
const AUDIO_PROBES: [string, string][] = [
  ['aac', 'audio/mp4; codecs="mp4a.40.2"'],
  ['opus', 'audio/mp4; codecs="opus"'],
  ['flac', 'audio/mp4; codecs="flac"'],
  ['mp3', 'audio/mp4; codecs="mp3"'],
];

export function probeCapabilities(
  supports: (mime: string) => boolean = (m) =>
    typeof MediaSource !== 'undefined' ? MediaSource.isTypeSupported(m) : false,
): Capabilities {
  return {
    mp4Video: VIDEO_PROBES.filter(([, m]) => supports(m)).map(([c]) => c),
    mp4Audio: AUDIO_PROBES.filter(([, m]) => supports(m)).map(([c]) => c),
    webm: supports('video/webm; codecs="vp9, opus"'),
    mp3: supports('audio/mpeg'),
    flac: supports('audio/flac') || supports('audio/mp4; codecs="flac"'),
  };
}

/**
 * The profile the server's StreamBuilder negotiates against: direct play for
 * what this browser decodes, otherwise an HLS transcode (fMP4 segments) to
 * the best codecs it decodes.
 */
export function buildDeviceProfile(caps: Capabilities): DeviceProfile {
  const direct: DeviceProfile['DirectPlayProfiles'] = [];
  if (caps.webm) {
    direct.push({ Container: 'webm', Type: 'Video', VideoCodec: 'vp9,vp8,av1', AudioCodec: 'opus,vorbis' });
  }
  if (caps.mp4Video.length) {
    direct.push({
      Container: 'mp4,m4v',
      Type: 'Video',
      VideoCodec: caps.mp4Video.join(','),
      AudioCodec: caps.mp4Audio.join(','),
    });
  }
  if (caps.mp3) direct.push({ Container: 'mp3', Type: 'Audio' });
  if (caps.flac) direct.push({ Container: 'flac', Type: 'Audio' });

  const transcoding: NonNullable<DeviceProfile['TranscodingProfiles']> = [];
  if (caps.mp4Video.length && caps.mp4Audio.length) {
    transcoding.push({
      Container: 'mp4',
      Type: 'Video',
      Protocol: 'hls',
      Context: 'Streaming',
      VideoCodec: caps.mp4Video.join(','),
      AudioCodec: caps.mp4Audio.join(','),
      MaxAudioChannels: '2',
      BreakOnNonKeyFrames: true,
      MinSegments: 1,
      SegmentLength: 0,
      EstimateContentLength: false,
      TranscodeSeekInfo: 'Auto',
      CopyTimestamps: false,
      EnableSubtitlesInManifest: false,
      EnableAudioVbrEncoding: true,
      EnableMpegtsM2TsMode: false,
    });
  }
  return {
    Name: 'Deadfin Web',
    MaxStreamingBitrate: 120_000_000,
    DirectPlayProfiles: direct,
    TranscodingProfiles: transcoding,
    SubtitleProfiles: [],
  };
}

export async function getPlaybackInfo(
  api: Api,
  itemId: string,
  userId: string,
  startTimeTicks = 0,
): Promise<PlaybackInfo> {
  const { data, error } = await api.POST('/Items/{itemId}/PlaybackInfo', {
    params: { path: { itemId }, query: { userId, startTimeTicks } },
    body: { DeviceProfile: buildDeviceProfile(probeCapabilities()), AutoOpenLiveStream: false },
  });
  if (error !== undefined || !data) throw new Error('PlaybackInfo failed');
  return data;
}

export type PlayMethod = 'DirectPlay' | 'Transcode';

/**
 * The stream to play: the first source the negotiation lets us direct-play,
 * else the first it offers to transcode for us. Undefined when neither.
 */
export function pickSource(info: PlaybackInfo): { media: MediaSource; method: PlayMethod } | undefined {
  const sources = info.MediaSources ?? [];
  const direct = sources.find((s) => s.SupportsDirectPlay);
  if (direct) return { media: direct, method: 'DirectPlay' };
  const transcode = sources.find((s) => s.SupportsTranscoding && s.TranscodingUrl);
  if (transcode) return { media: transcode, method: 'Transcode' };
  return undefined;
}

/**
 * The server's HLS playlist for a transcode. TranscodingUrl is relative to
 * the server and normally carries the token; add it when it does not, since
 * hls.js segment requests can send headers but native HLS cannot.
 */
export function transcodeUrl(serverUrl: string, source: MediaSource, token: string): string {
  const url = new URL(serverUrl.replace(/\/$/, '') + (source.TranscodingUrl ?? ''));
  if (!url.searchParams.has('api_key') && !url.searchParams.has('ApiKey')) url.searchParams.set('api_key', token);
  return url.toString();
}

/**
 * Static (direct-play) stream URL. The <video> element cannot send an
 * Authorization header, so the token rides the api_key query parameter —
 * the same mechanism jellyfin-web uses for media elements.
 */
export function directStreamUrl(
  serverUrl: string,
  itemId: string,
  source: MediaSource,
  token: string,
): string {
  const container = source.Container ?? 'webm';
  const q = new URLSearchParams({
    static: 'true',
    api_key: token,
    deviceId: deviceId(),
  });
  if (source.Id) q.set('mediaSourceId', source.Id);
  return `${serverUrl}/Videos/${itemId}/stream.${container}?${q}`;
}

interface ReportCtx {
  api: Api;
  itemId: string;
  mediaSourceId?: string | null;
  playSessionId?: string | null;
  playMethod?: PlayMethod;
}

const common = (ctx: ReportCtx, positionTicks: number) => ({
  ItemId: ctx.itemId,
  MediaSourceId: ctx.mediaSourceId ?? undefined,
  PlaySessionId: ctx.playSessionId ?? undefined,
  PositionTicks: Math.max(0, Math.round(positionTicks)),
  PlayMethod: ctx.playMethod ?? 'DirectPlay',
  CanSeek: true,
});

/* Reporting is fire-and-forget: a lost report must never break playback. */
export function reportStart(ctx: ReportCtx, positionTicks: number): void {
  void ctx.api
    .POST('/Sessions/Playing', { body: { ...common(ctx, positionTicks), IsPaused: false } })
    .catch(() => undefined);
}

export function reportProgress(ctx: ReportCtx, positionTicks: number, isPaused: boolean): void {
  void ctx.api
    .POST('/Sessions/Playing/Progress', { body: { ...common(ctx, positionTicks), IsPaused: isPaused } })
    .catch(() => undefined);
}

/*
 * keepalive: the stop report is often the last request a closing tab sends.
 * Chromium refuses keepalive when the request needs a CORS preflight (app
 * and server on different origins), so on that refusal send it plainly.
 */
export function reportStopped(ctx: ReportCtx, positionTicks: number): void {
  const body = common(ctx, positionTicks);
  void ctx.api
    .POST('/Sessions/Playing/Stopped', { body, keepalive: true })
    .catch(() => ctx.api.POST('/Sessions/Playing/Stopped', { body }))
    .catch(() => undefined);
}
