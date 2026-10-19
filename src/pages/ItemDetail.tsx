import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { backdropImageUrl, primaryBlurhash, primaryImageUrl, type Api } from '../api/client';
import { episodeLabel } from '../api/tv';
import { Poster } from '../components/Poster';
import { SeriesEpisodes } from './Series';
import { formatRemaining, formatRuntime, progressPercent } from '../lib/format';
import { detailsUrl, paths, videoUrl } from '../routes/paths';
import './item-detail.css';

export function ItemDetail() {
  const itemId = useSearchParams()[0].get('id');
  const { session, api } = useAuth();
  if (!session || !api || !itemId) return null;
  return <Detail key={itemId} api={api} serverUrl={session.serverUrl} userId={session.userId} itemId={itemId} />;
}

function Detail(props: { api: Api; serverUrl: string; userId: string; itemId: string }) {
  const { api, serverUrl, userId, itemId } = props;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const item = useQuery({
    queryKey: ['item', userId, itemId],
    queryFn: async () => {
      const { data, error } = await api.GET('/Items/{itemId}', {
        params: { path: { itemId }, query: { userId } },
      });
      if (error !== undefined || !data) throw new Error(`Items/${itemId} failed`);
      return data;
    },
  });

  const setUserData = useMutation({
    mutationFn: async (change: { kind: 'played' | 'favorite'; on: boolean }) => {
      const path = change.kind === 'played' ? '/UserPlayedItems/{itemId}' : '/UserFavoriteItems/{itemId}';
      const method = change.on ? api.POST : api.DELETE;
      const { data, error } = await method(path as never, {
        params: { path: { itemId }, query: { userId } },
      } as never);
      if (error !== undefined) throw new Error(`${change.kind} toggle failed`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['item', userId, itemId] });
      void queryClient.invalidateQueries({ queryKey: ['resume', userId] });
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['episodes'] });
      void queryClient.invalidateQueries({ queryKey: ['seasons'] });
      void queryClient.invalidateQueries({ queryKey: ['next-up'] });
    },
  });

  if (item.isPending)
    return (
      <main className="detail">
        <p className="home-status readout">Loading…</p>
      </main>
    );
  if (item.isError)
    return (
      <main className="detail">
        <p className="home-status readout" role="alert">
          This item could not be loaded. <Link to={paths.home}>Home</Link>
        </p>
      </main>
    );

  const it = item.data;
  // Seasons open as their series with that season selected.
  if (it.Type === 'Season' && it.SeriesId) {
    return <Navigate to={detailsUrl(it.SeriesId, { season: it.Id })} replace />;
  }
  const playable = isPlayable(it);
  const backdrop = backdropImageUrl(serverUrl, it);
  const progress = progressPercent(it.UserData?.PlaybackPositionTicks, it.RunTimeTicks);
  const played = it.UserData?.Played ?? false;
  const favorite = it.UserData?.IsFavorite ?? false;
  const meta = [
    it.ProductionYear,
    formatRuntime(it.RunTimeTicks),
    it.OfficialRating,
    typeof it.CommunityRating === 'number' ? `★ ${it.CommunityRating.toFixed(1)}` : null,
  ].filter(Boolean);

  return (
    <main className="detail" data-testid="item-detail">
      <div className="detail-backdrop" aria-hidden="true">
        {backdrop && <img src={backdrop} alt="" />}
      </div>


      <section className="detail-body">
        <div className="detail-poster">
          <Poster
            title={it.Name ?? ''}
            imageUrl={primaryImageUrl(serverUrl, it)}
            blurhash={primaryBlurhash(it)}
            caption={false}
          />
        </div>

        <div className="detail-info">
          {it.Type === 'Episode' && it.SeriesId && (
            <p className="detail-crumbs readout" data-testid="detail-crumbs">
              <Link to={detailsUrl(it.SeriesId)}>{it.SeriesName ?? 'Series'}</Link>
              {it.SeasonId && (
                <>
                  {' · '}
                  <Link to={detailsUrl(it.SeriesId, { season: it.SeasonId })}>{it.SeasonName ?? 'Season'}</Link>
                </>
              )}
              {episodeLabel(it) && ` · ${episodeLabel(it)}`}
            </p>
          )}
          <h1 className="detail-title">{it.Name}</h1>
          <p className="detail-meta readout">{meta.join('  ·  ')}</p>

          {playable && progress > 0 && !played && (
            <div className="detail-progress" data-testid="detail-progress">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="readout">
                {formatRemaining(it.UserData?.PlaybackPositionTicks, it.RunTimeTicks)}
              </span>
            </div>
          )}

          <div className="detail-actions">
            {playable && (
              <button
                className="action-primary"
                data-testid="action-play"
                onClick={() => navigate(videoUrl(itemId))}
              >
                ▶ Play
              </button>
            )}
            {playable && progress > 0 && !played && (
              <button
                className="action-primary"
                data-testid="action-resume"
                onClick={() =>
                  navigate(videoUrl(itemId, it.UserData?.PlaybackPositionTicks))
                }
              >
                Resume
              </button>
            )}
            <button
              className={played ? 'action-toggle is-on' : 'action-toggle'}
              data-testid="toggle-played"
              disabled={setUserData.isPending}
              onClick={() => setUserData.mutate({ kind: 'played', on: !played })}
            >
              {played ? '✓ Played' : 'Mark played'}
            </button>
            <button
              className={favorite ? 'action-toggle is-on' : 'action-toggle'}
              data-testid="toggle-favorite"
              disabled={setUserData.isPending}
              onClick={() => setUserData.mutate({ kind: 'favorite', on: !favorite })}
            >
              {favorite ? '♥ Favorite' : 'Add to favorites'}
            </button>
          </div>

          {it.Genres && it.Genres.length > 0 && (
            <p className="detail-genres">
              {it.Genres.map((g) => (
                <span key={g} className="genre-chip readout">
                  {g}
                </span>
              ))}
            </p>
          )}

          {it.Overview && <p className="detail-overview">{it.Overview}</p>}

          {it.Type === 'Series' && it.Id && (
            <SeriesEpisodes api={api} serverUrl={serverUrl} userId={userId} seriesId={it.Id} />
          )}

          {it.People && it.People.length > 0 && (
            <div className="detail-people">
              <h2 className="readout">Cast & Crew</h2>
              <ul>
                {it.People.slice(0, 8).map((p, i) => (
                  <li key={p.Id ?? i}>
                    <span className="person-name">{p.Name}</span>
                    {(p.Role ?? p.Type) && <span className="readout"> — {p.Role ?? p.Type}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Whether the player can open this item: a single video or audio file.
 * Series, seasons, albums, box sets and folders have children instead.
 */
export function isPlayable(item: { IsFolder?: boolean | null; MediaType?: string | null }): boolean {
  if (item.IsFolder) return false;
  return item.MediaType === 'Video' || item.MediaType === 'Audio';
}
