import { useState, type DragEvent, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { Api } from '../../api/client';
import {
  PERSON_SECTIONS,
  fetchCanEditPlaylist,
  fetchChildrenPage,
  fetchPersonItemsPage,
  fetchPlaylistPage,
  fetchSeasonEpisodesPage,
  movePlaylistItem,
  removeFromPlaylist,
  thumbUrl,
} from '../../api/items';
import type { BaseItem } from '../../api/library';
import { episodeLabel, fetchNextUp, fetchSeasons, playUrl } from '../../api/tv';
import { ItemCard } from '../../components/ItemCard';
import { formatRuntime, progressPercent } from '../../lib/format';
import { detailsUrl } from '../../routes/paths';
import { Scroller, SeasonCard, Section, WideCard } from './cards';
import { Icon } from './icons';
import { StreamSentinel, useStreamedList } from './streamed';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
}

/** Series: Next Up, then the Seasons row (jellyfin-web `nextUpSection`, `childrenCollapsible`). */
export function SeriesChildren(props: Ctx & { series: BaseItem }) {
  const { api, serverUrl, userId, series } = props;
  const seriesId = series.Id ?? '';
  const nextUp = useQuery({
    queryKey: ['next-up', userId, seriesId],
    queryFn: () => fetchNextUp(api, userId, { seriesId, limit: 4 }),
  });
  const seasons = useQuery({ queryKey: ['seasons', userId, seriesId], queryFn: () => fetchSeasons(api, userId, seriesId) });
  return (
    <>
      {(nextUp.data?.length ?? 0) > 0 && (
        <Section title="Next Up" testId="next-up">
          <div className="wide-grid">
            {nextUp.data!.map((e) => (
              <WideCard key={e.Id} serverUrl={serverUrl} item={e} />
            ))}
          </div>
        </Section>
      )}
      {seasons.isError && (
        <p className="home-status readout" role="alert">
          Seasons could not be loaded.
        </p>
      )}
      {(seasons.data?.length ?? 0) > 0 && (
        <Section title="Seasons" testId="seasons">
          <Scroller label="Seasons">
            {seasons.data!.map((s) => (
              <SeasonCard key={s.Id} serverUrl={serverUrl} season={s} />
            ))}
          </Scroller>
        </Section>
      )}
      {seasons.data?.length === 0 && (
        <p className="home-status readout" data-testid="series-empty">
          No Items are currently available.
        </p>
      )}
    </>
  );
}

/** One row of an episode list (season page) or a playlist. */
function EpisodeRow(props: {
  serverUrl: string;
  item: BaseItem;
  index?: number;
  showSeries?: boolean;
  lead?: ReactNode;
  trail?: ReactNode;
  rowProps?: HTMLAttributes<HTMLLIElement>;
}) {
  const { item: e, serverUrl } = props;
  const navigate = useNavigate();
  const pct = progressPercent(e.UserData?.PlaybackPositionTicks, e.RunTimeTicks);
  const thumb = thumbUrl(serverUrl, e, 320);
  const label = e.Type === 'Episode' ? episodeLabel(e) : '';
  // jellyfin-web lists episodes as "2. Name", a special as "Special - Name".
  const name =
    e.Type === 'Episode' && e.ParentIndexNumber === 0
      ? `Special - ${e.Name ?? ''}`
      : e.Type === 'Episode' && typeof e.IndexNumber === 'number' && !props.showSeries
        ? `${e.IndexNumber}. ${e.Name ?? ''}`
        : (e.Name ?? '');
  const sub = props.showSeries && e.SeriesName ? [e.SeriesName, label].filter(Boolean).join(' - ') : '';
  const playable = !e.IsFolder && (e.MediaType === 'Video' || e.MediaType === 'Audio');
  return (
    <li className="episode-row" data-testid="episode-row" {...props.rowProps}>
      {props.lead}
      <Link to={detailsUrl(e.Id ?? '')} className="episode-thumb" aria-hidden="true" tabIndex={-1}>
        {thumb && <img src={thumb} alt="" loading="lazy" />}
        {pct > 0 && !e.UserData?.Played && (
          <span className="poster-progress">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </Link>
      <div className="episode-info">
        <Link to={detailsUrl(e.Id ?? '')} className="episode-name">
          {name}
        </Link>
        <span className="readout episode-meta">
          {[sub, formatRuntime(e.RunTimeTicks), e.UserData?.Played ? '✓ Played' : ''].filter(Boolean).join(' · ')}
        </span>
        {e.Overview && <p className="episode-overview">{e.Overview}</p>}
      </div>
      {playable && (
        <button
          type="button"
          className="episode-play"
          aria-label={`Play ${name}`.trim()}
          title="Play"
          onClick={() => navigate(playUrl(e))}
        >
          <Icon name="play" />
        </button>
      )}
      {props.trail}
    </li>
  );
}

/** Season: its own page with the episode list, streamed (jellyfin-web lists all; we page by 36). */
export function SeasonEpisodes(props: Ctx & { season: BaseItem }) {
  const { api, serverUrl, userId, season } = props;
  const seriesId = season.SeriesId ?? '';
  const seasonId = season.Id ?? '';
  const list = useStreamedList(
    ['episodes', userId, seriesId, seasonId],
    (start, limit) => fetchSeasonEpisodesPage(api, userId, seriesId, seasonId, start, limit),
    seriesId !== '',
  );
  if (list.query.isError)
    return (
      <p className="home-status readout" role="alert">
        Episodes could not be loaded.
      </p>
    );
  if (list.query.isSuccess && list.all.length === 0)
    return (
      <p className="home-status readout" data-testid="series-empty">
        No Items are currently available.
      </p>
    );
  return (
    <section className="detail-section" aria-label="Episodes">
      <ol className="episode-list" data-testid="episode-list">
        {list.all.map((e) => (
          <EpisodeRow key={e.Id} serverUrl={serverUrl} item={e} />
        ))}
      </ol>
      <StreamSentinel list={list} />
    </section>
  );
}

/** Episode: "More from Season 1", the season's episodes as a row. */
export function MoreFromSeason(props: Ctx & { episode: BaseItem }) {
  const { api, serverUrl, userId, episode } = props;
  const seriesId = episode.SeriesId ?? '';
  const seasonId = episode.SeasonId ?? '';
  const list = useStreamedList(
    ['episodes', userId, seriesId, seasonId],
    (start, limit) => fetchSeasonEpisodesPage(api, userId, seriesId, seasonId, start, limit),
    seriesId !== '' && seasonId !== '',
  );
  if (list.all.length < 2) return null;
  return (
    <Section title={`More from ${episode.SeasonName ?? 'Season'}`} testId="more-from-season">
      <Scroller label={`More from ${episode.SeasonName ?? 'Season'}`}>
        {list.all.map((e) => (
          <WideCard key={e.Id} serverUrl={serverUrl} item={e} current={e.Id === episode.Id} />
        ))}
        <StreamSentinel list={list} />
      </Scroller>
    </Section>
  );
}

/** jellyfin-web `renderCollectionItems`: a collection's items grouped by type, in this order. */
const COLLECTION_GROUPS: { name: string; test: (i: BaseItem) => boolean }[] = [
  { name: 'Movies', test: (i) => i.Type === 'Movie' },
  { name: 'Series', test: (i) => i.Type === 'Series' },
  { name: 'Episodes', test: (i) => i.Type === 'Episode' },
  { name: 'Videos', test: (i) => i.MediaType === 'Video' },
  { name: 'Albums', test: (i) => i.Type === 'MusicAlbum' },
  { name: 'Books', test: (i) => i.Type === 'Book' },
  { name: 'Collections', test: (i) => i.Type === 'BoxSet' },
];

export function groupCollection(items: BaseItem[]): { name: string; items: BaseItem[] }[] {
  let rest = items;
  const out: { name: string; items: BaseItem[] }[] = [];
  for (const g of COLLECTION_GROUPS) {
    const hit = rest.filter(g.test);
    rest = rest.filter((i) => !g.test(i));
    if (hit.length) out.push({ name: g.name, items: hit });
  }
  if (rest.length) out.push({ name: 'Other Items', items: rest });
  return out;
}

export function CollectionItems(props: Ctx & { collection: BaseItem }) {
  const { api, serverUrl, userId, collection } = props;
  const id = collection.Id ?? '';
  const list = useStreamedList(['collection-items', userId, id], (start, limit) =>
    fetchChildrenPage(api, userId, id, start, limit),
  );
  if (list.query.isError)
    return (
      <p className="home-status readout" role="alert">
        This list could not be loaded.
      </p>
    );
  const groups = list.query.isSuccess && list.all.length === 0 ? [{ name: 'Items', items: [] }] : groupCollection(list.all);
  return (
    <div data-testid="collection-items">
      {groups.map((g) => (
        <Section key={g.name} title={g.name}>
          {g.items.length === 0 ? (
            <p className="home-status readout">No Items are currently available.</p>
          ) : (
            <div className="detail-grid">
              {g.items.map((i) => (
                <ItemCard key={i.Id} serverUrl={serverUrl} item={i} />
              ))}
            </div>
          )}
        </Section>
      ))}
      <StreamSentinel list={list} />
    </div>
  );
}

function PersonSection(props: Ctx & { personId: string; section: (typeof PERSON_SECTIONS)[number] }) {
  const { api, serverUrl, userId, personId, section } = props;
  const list = useStreamedList(['person-items', userId, personId, section.type], (start, limit) =>
    fetchPersonItemsPage(api, userId, personId, section, start, limit),
  );
  if (list.all.length === 0) return null;
  return (
    <Section title={section.name} testId={`person-${section.type}`}>
      <div className="detail-grid">
        {list.all.map((i) => (
          <ItemCard key={i.Id} serverUrl={serverUrl} item={i} />
        ))}
      </div>
      <StreamSentinel list={list} />
    </Section>
  );
}

/** Person: Movies, Shows, Episodes… each a streamed grid; empty sections are hidden (jellyfin-web `itemsByName`). */
export function PersonItems(props: Ctx & { person: BaseItem }) {
  return (
    <div data-testid="person-items">
      {PERSON_SECTIONS.map((s) => (
        <PersonSection key={s.type} {...props} personId={props.person.Id ?? ''} section={s} />
      ))}
    </div>
  );
}

/**
 * Playlist: its items in order, streamed. A user who can edit it drags a
 * row (or presses Arrow Up / Arrow Down on the handle) to reorder, and
 * removes a row with its Remove button (jellyfin-web `playlistViewer`).
 */
export function PlaylistItems(props: Ctx & { playlist: BaseItem }) {
  const { api, serverUrl, userId, playlist } = props;
  const id = playlist.Id ?? '';
  const queryClient = useQueryClient();
  const key = ['playlist-items', userId, id];
  const list = useStreamedList(key, (start, limit) => fetchPlaylistPage(api, userId, id, start, limit));
  const canEdit = useQuery({ queryKey: ['playlist-can-edit', userId, id], queryFn: () => fetchCanEditPlaylist(api, userId, id) });
  const editable = canEdit.data === true;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['item', userId, id] });
  };
  const move = useMutation({
    mutationFn: (m: { entry: string; to: number }) => movePlaylistItem(api, id, m.entry, m.to),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (entry: string) => removeFromPlaylist(api, id, [entry]), onSettled: refresh });

  const moveTo = (from: number, to: number) => {
    const entry = list.all[from]?.PlaylistItemId;
    if (!entry || to < 0 || to >= (list.total ?? list.all.length) || to === from) return;
    move.mutate({ entry, to });
  };

  if (list.query.isError)
    return (
      <p className="home-status readout" role="alert">
        This list could not be loaded.
      </p>
    );
  if (list.query.isSuccess && list.all.length === 0)
    return (
      <p className="home-status readout" data-testid="playlist-empty">
        No Items are currently available.
      </p>
    );
  const busy = move.isPending || remove.isPending;
  return (
    <section className="detail-section" aria-label="Items">
      <ol className={busy ? 'episode-list is-busy' : 'episode-list'} data-testid="playlist-items" aria-busy={busy}>
        {list.all.map((item, i) => {
          const drag = editable
            ? {
                draggable: true,
                onDragStart: (e: DragEvent<HTMLLIElement>) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                },
                onDragOver: (e: DragEvent<HTMLLIElement>) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDropAt(i);
                },
                onDragEnd: () => {
                  setDragFrom(null);
                  setDropAt(null);
                },
                onDrop: (e: DragEvent<HTMLLIElement>) => {
                  e.preventDefault();
                  if (dragFrom !== null) moveTo(dragFrom, i);
                  setDragFrom(null);
                  setDropAt(null);
                },
                className: dropAt === i && dragFrom !== i ? 'episode-row is-drop' : 'episode-row',
              }
            : {};
          const onHandleKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveTo(i, i - 1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveTo(i, i + 1);
            }
          };
          return (
            <EpisodeRow
              key={item.PlaylistItemId ?? item.Id ?? i}
              serverUrl={serverUrl}
              item={item}
              showSeries
              rowProps={drag}
              lead={
                editable ? (
                  <button
                    type="button"
                    className="playlist-handle"
                    aria-label={`Move ${item.Name ?? ''}. Use Arrow Up and Arrow Down.`}
                    title="Drag to reorder"
                    onKeyDown={onHandleKey}
                    disabled={busy}
                  >
                    <Icon name="drag" />
                  </button>
                ) : (
                  <span className="playlist-index readout">{i + 1}</span>
                )
              }
              trail={
                editable && item.PlaylistItemId ? (
                  <button
                    type="button"
                    className="episode-play"
                    title="Remove from playlist"
                    aria-label={`Remove from playlist: ${item.Name ?? ''}`}
                    disabled={busy}
                    data-testid="playlist-remove"
                    onClick={() => remove.mutate(item.PlaylistItemId!)}
                  >
                    <Icon name="remove" />
                  </button>
                ) : null
              }
            />
          );
        })}
      </ol>
      <StreamSentinel list={list} />
    </section>
  );
}
