import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Api } from '../api/client';
import { primaryImageUrl } from '../api/client';
import type { BaseItem } from '../api/library';
import { episodeLabel, fetchEpisodes, fetchNextUp, fetchSeasons, pickSeason } from '../api/tv';
import { formatRuntime, progressPercent } from '../lib/format';
import './series.css';

/** The "Play next" target for a series: its Next Up, else the first unplayed episode shown. */
export function playNextTarget(nextUp: BaseItem | undefined, episodes: BaseItem[]): BaseItem | undefined {
  return nextUp ?? episodes.find((e) => !e.UserData?.Played) ?? episodes[0];
}

/** Play URL for an episode, resuming where it was left. */
export function playUrl(item: BaseItem): string {
  const t = item.UserData?.PlaybackPositionTicks ?? 0;
  return t > 0 && !item.UserData?.Played ? `/play/${item.Id}?t=${t}` : `/play/${item.Id}`;
}

export function SeriesEpisodes(props: { api: Api; serverUrl: string; userId: string; seriesId: string }) {
  const { api, serverUrl, userId, seriesId } = props;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const seasons = useQuery({
    queryKey: ['seasons', userId, seriesId],
    queryFn: () => fetchSeasons(api, userId, seriesId),
  });
  const season = seasons.data ? pickSeason(seasons.data, params.get('season')) : undefined;
  const seasonId = season?.Id ?? '';

  const episodes = useQuery({
    queryKey: ['episodes', userId, seriesId, seasonId],
    queryFn: () => fetchEpisodes(api, userId, seriesId, seasonId),
    enabled: seasonId !== '',
  });
  const nextUp = useQuery({
    queryKey: ['next-up', userId, seriesId],
    queryFn: () => fetchNextUp(api, userId, { seriesId, limit: 1 }),
  });
  const next = playNextTarget(nextUp.data?.[0], episodes.data ?? []);

  if (seasons.isError) {
    return (
      <p className="home-status readout" role="alert">
        ▲ seasons could not be loaded
      </p>
    );
  }
  if (seasons.data && seasons.data.length === 0) {
    return (
      <p className="home-status readout" data-testid="series-empty">
        no episodes yet
      </p>
    );
  }

  return (
    <section className="series" data-testid="series">
      {next && (
        <div className="detail-actions">
          <button className="action-primary" data-testid="series-play-next" onClick={() => navigate(playUrl(next))}>
            ▶ Play {episodeLabel(next)}
            {next.Name ? ` · ${next.Name}` : ''}
          </button>
        </div>
      )}

      <div className="season-tabs" role="tablist" aria-label="Seasons">
        {(seasons.data ?? []).map((s) => (
          <button
            key={s.Id}
            role="tab"
            aria-selected={s.Id === seasonId}
            className={s.Id === seasonId ? 'season-tab is-on readout' : 'season-tab readout'}
            onClick={() => setParams({ season: s.Id ?? '' }, { replace: true })}
          >
            {s.Name ?? `Season ${s.IndexNumber ?? ''}`}
          </button>
        ))}
      </div>

      <ol className="episode-list" role="tabpanel" data-testid="episode-list">
        {(episodes.data ?? []).map((e) => {
          const pct = progressPercent(e.UserData?.PlaybackPositionTicks, e.RunTimeTicks);
          const thumb = primaryImageUrl(serverUrl, e, 320);
          return (
            <li key={e.Id} className="episode-row" data-testid="episode-row">
              <Link to={`/item/${e.Id}`} className="episode-thumb" aria-hidden="true" tabIndex={-1}>
                {thumb && <img src={thumb} alt="" loading="lazy" />}
                {pct > 0 && !e.UserData?.Played && (
                  <span className="poster-progress">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                )}
              </Link>
              <div className="episode-info">
                <Link to={`/item/${e.Id}`} className="episode-name">
                  <span className="readout">{episodeLabel(e)}</span> {e.Name}
                </Link>
                <span className="readout episode-meta">
                  {formatRuntime(e.RunTimeTicks)}
                  {e.UserData?.Played ? ' · ✓ played' : ''}
                </span>
                {e.Overview && <p className="episode-overview">{e.Overview}</p>}
              </div>
              <button
                className="episode-play readout"
                aria-label={`Play ${episodeLabel(e)} ${e.Name ?? ''}`.trim()}
                onClick={() => navigate(playUrl(e))}
              >
                ▶
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
