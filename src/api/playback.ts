import type { components } from './schema';
import type { Api } from './client';
import { deviceId } from './session';

type DeviceProfile = components['schemas']['DeviceProfile'];
export type MediaSource = components['schemas']['MediaSourceInfo'];
export type PlaybackInfo = components['schemas']['PlaybackInfoResponse'];

/**
 * What this client can genuinely direct-play. Honest and minimal: no
 * TranscodingProfiles yet, so a source we can't direct-play is a
 * visible fault, not a silent transcode. This request is the client's first
 * exercise of the server's StreamBuilder negotiation.
 */
export const DEVICE_PROFILE: DeviceProfile = {
  Name: 'Deadfin Web',
  MaxStreamingBitrate: 120_000_000,
  DirectPlayProfiles: [
    { Container: 'webm', Type: 'Video', VideoCodec: 'vp9,vp8,av1', AudioCodec: 'opus,vorbis' },
    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,hevc,av1', AudioCodec: 'aac,mp3,opus,flac' },
    { Container: 'mp3', Type: 'Audio' },
    { Container: 'flac', Type: 'Audio' },
  ],
  TranscodingProfiles: [],
  SubtitleProfiles: [],
};

export async function getPlaybackInfo(
  api: Api,
  itemId: string,
  userId: string,
  startTimeTicks = 0,
): Promise<PlaybackInfo> {
  const { data, error } = await api.POST('/Items/{itemId}/PlaybackInfo', {
    params: { path: { itemId }, query: { userId, startTimeTicks } },
    body: { DeviceProfile: DEVICE_PROFILE, AutoOpenLiveStream: false },
  });
  if (error !== undefined || !data) throw new Error('PlaybackInfo failed');
  return data;
}

/** First media source the negotiation says we can direct-play, if any. */
export function pickDirectPlaySource(info: PlaybackInfo): MediaSource | undefined {
  return (info.MediaSources ?? []).find((s) => s.SupportsDirectPlay);
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
}

const common = (ctx: ReportCtx, positionTicks: number) => ({
  ItemId: ctx.itemId,
  MediaSourceId: ctx.mediaSourceId ?? undefined,
  PlaySessionId: ctx.playSessionId ?? undefined,
  PositionTicks: Math.max(0, Math.round(positionTicks)),
  PlayMethod: 'DirectPlay' as const,
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
