import type { components } from './schema';
import type { MediaSource } from './playback';

type MediaStream = components['schemas']['MediaStream'];
type SubtitleProfile = components['schemas']['SubtitleProfile'];

/**
 * Text subtitles come to the browser as WebVTT, the one format <track>
 * reads; declaring only vtt makes the server convert srt, ass and the rest.
 * Image subtitles (PGS, VobSub, DVB) can only be burned into a transcode.
 */
export const SUBTITLE_PROFILES: SubtitleProfile[] = [
  { Format: 'vtt', Method: 'External' },
  ...['pgssub', 'dvdsub', 'dvbsub'].map((Format) => ({ Format, Method: 'Encode' as const })),
];

export interface Track {
  index: number;
  label: string;
  /** Subtitles only: text the browser renders itself, vs an image the server must burn in. */
  text: boolean;
}

export function trackLabel(s: MediaStream): string {
  if (s.DisplayTitle) return s.DisplayTitle;
  const parts = [s.Language, s.Title, s.Codec?.toUpperCase()].filter(Boolean);
  return parts.length ? parts.join(' · ') : `Track ${s.Index ?? '?'}`;
}

function streams(media: MediaSource, type: MediaStream['Type']): MediaStream[] {
  return (media.MediaStreams ?? []).filter((s) => s.Type === type && typeof s.Index === 'number');
}

export function audioTracks(media: MediaSource): Track[] {
  return streams(media, 'Audio').map((s) => ({ index: s.Index!, label: trackLabel(s), text: false }));
}

export function subtitleTracks(media: MediaSource): Track[] {
  return streams(media, 'Subtitle').map((s) => ({
    index: s.Index!,
    label: trackLabel(s),
    text: s.IsTextSubtitleStream ?? false,
  }));
}

/** The audio stream the server picks when not told otherwise. */
export function defaultAudioIndex(media: MediaSource): number | undefined {
  const d = media.DefaultAudioStreamIndex;
  if (typeof d === 'number' && d >= 0) return d;
  return audioTracks(media)[0]?.index;
}

/** The subtitle stream on by default (forced or flagged default), or null for off. */
export function defaultSubtitleIndex(media: MediaSource): number | null {
  const d = media.DefaultSubtitleStreamIndex;
  return typeof d === 'number' && d >= 0 ? d : null;
}

/** The WebVTT for a text subtitle stream, with the token for a plain fetch. */
export function subtitleUrl(
  serverUrl: string,
  itemId: string,
  media: MediaSource,
  index: number,
  token: string,
): string {
  const stream = streams(media, 'Subtitle').find((s) => s.Index === index);
  // The delivery URL when the server offers WebVTT; otherwise ask for it.
  const delivered = stream?.DeliveryMethod === 'External' ? stream.DeliveryUrl : undefined;
  const path =
    delivered && /\.vtt(\?|$)/i.test(delivered)
      ? delivered
      : `/Videos/${itemId}/${media.Id}/Subtitles/${index}/0/Stream.vtt`;
  const url = new URL(/^https?:/.test(path) ? path : serverUrl.replace(/\/$/, '') + path);
  if (!url.searchParams.has('api_key') && !url.searchParams.has('ApiKey')) url.searchParams.set('api_key', token);
  return url.toString();
}

/** What a track choice asks of the server. */
export interface StreamRequest {
  /** Set only for a non-default audio track: the server then remuxes or transcodes with it. */
  audioStreamIndex?: number;
  /** Set only for an image subtitle, which the server burns in. */
  burnSubtitleIndex?: number;
}

/**
 * Browsers cannot switch a direct-played file's audio track, and cannot draw
 * image subtitles, so either choice goes back to the server for a stream
 * built with it. Text subtitles and the default audio need nothing.
 */
export function streamRequestFor(media: MediaSource, audio: number | undefined, subtitle: number | null): StreamRequest {
  const req: StreamRequest = {};
  if (audio !== undefined && audio !== defaultAudioIndex(media)) req.audioStreamIndex = audio;
  const sub = subtitle === null ? undefined : subtitleTracks(media).find((t) => t.index === subtitle);
  if (sub && !sub.text) req.burnSubtitleIndex = sub.index;
  return req;
}

export function sameRequest(a: StreamRequest, b: StreamRequest): boolean {
  return a.audioStreamIndex === b.audioStreamIndex && a.burnSubtitleIndex === b.burnSubtitleIndex;
}
