import { useId } from 'react';
import type { BaseItem } from '../../api/library';
import type { MediaSource } from '../../api/playback';
import { audioTracks, defaultAudioIndex, defaultSubtitleIndex, subtitleTracks, trackLabel } from '../../api/tracks';
import type { TrackChoice } from '../../routes/paths';

export interface Selection {
  sourceId?: string;
  audio?: number;
  /** null is Off; undefined is the source's default. */
  subtitle?: number | null;
}

/** The version the selection names, else the first. */
export function selectedSource(item: BaseItem, sel: Selection): MediaSource | undefined {
  const sources = item.MediaSources ?? [];
  return sources.find((s) => s.Id === sel.sourceId) ?? sources[0];
}

/**
 * What the player URL carries: the version when there is a choice, and a
 * track only when it differs from the server's default, so a default play
 * stays a direct play.
 */
export function trackChoice(item: BaseItem, sel: Selection): TrackChoice {
  const src = selectedSource(item, sel);
  if (!src) return {};
  const out: TrackChoice = {};
  if ((item.MediaSources?.length ?? 0) > 1) out.mediaSourceId = src.Id;
  if (sel.audio !== undefined && sel.audio !== defaultAudioIndex(src)) out.audio = sel.audio;
  if (sel.subtitle !== undefined && sel.subtitle !== defaultSubtitleIndex(src)) out.subtitle = sel.subtitle ?? -1;
  return out;
}

/** Version, Video, Audio and Subtitles selects above the overview (jellyfin-web `trackSelections`). */
export function TrackSelections(props: { item: BaseItem; value: Selection; onChange: (s: Selection) => void }) {
  const { item, value } = props;
  const ids = { source: useId(), video: useId(), audio: useId(), sub: useId() };
  const sources = item.MediaSources ?? [];
  const src = selectedSource(item, value);
  if (item.MediaType !== 'Video' || item.Type === 'TvChannel' || !src) return null;
  if (sources.length === 1 && src.Type === 'Placeholder') return null;
  const video = (src.MediaStreams ?? []).filter((s) => s.Type === 'Video');
  const audio = audioTracks(src);
  const subs = subtitleTracks(src);
  const audioValue = value.audio ?? defaultAudioIndex(src);
  const subValue = value.subtitle === undefined ? defaultSubtitleIndex(src) : value.subtitle;
  return (
    <form className="track-selections" data-testid="track-selections" onSubmit={(e) => e.preventDefault()}>
      {sources.length > 1 && (
        <div className="track-field">
          <label htmlFor={ids.source}>Version</label>
          <select
            id={ids.source}
            value={src.Id ?? ''}
            onChange={(e) => props.onChange({ sourceId: e.target.value })}
          >
            {sources.map((s) => (
              <option key={s.Id} value={s.Id ?? ''}>
                {s.Name}
              </option>
            ))}
          </select>
        </div>
      )}
      {video.length > 0 && (
        <div className="track-field">
          <label htmlFor={ids.video}>Video</label>
          <select id={ids.video} disabled={video.length < 2} value={String(video[0]!.Index)} onChange={() => undefined}>
            {video.map((s) => (
              <option key={s.Index} value={String(s.Index)}>
                {trackLabel(s)}
              </option>
            ))}
          </select>
        </div>
      )}
      {audio.length > 0 && (
        <div className="track-field">
          <label htmlFor={ids.audio}>Audio</label>
          <select
            id={ids.audio}
            disabled={audio.length < 2}
            value={String(audioValue ?? '')}
            onChange={(e) => props.onChange({ ...value, sourceId: src.Id ?? undefined, audio: Number(e.target.value) })}
          >
            {audio.map((t) => (
              <option key={t.index} value={String(t.index)}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {subs.length > 0 && (
        <div className="track-field">
          <label htmlFor={ids.sub}>Subtitles</label>
          <select
            id={ids.sub}
            value={subValue === null ? '-1' : String(subValue)}
            onChange={(e) => {
              const n = Number(e.target.value);
              props.onChange({ ...value, sourceId: src.Id ?? undefined, subtitle: n < 0 ? null : n });
            }}
          >
            <option value="-1">Off</option>
            {subs.map((t) => (
              <option key={t.index} value={String(t.index)}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </form>
  );
}
