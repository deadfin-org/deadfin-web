import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import { primaryBlurhash, primaryImageUrl, type Api } from '../../api/client';
import { useCurrentUser } from '../../api/currentUser';
import {
  canMarkPlayed,
  canRate,
  detailBackdropUrl,
  detailsGroup,
  fetchItem,
  fetchLocalTrailers,
  fetchSimilar,
  fetchSpecialFeatures,
  isPlayable,
  logoUrl,
  playTarget,
  playsChildren,
  primaryMediaInfo,
  shuffleTarget,
  splitPeople,
} from '../../api/items';
import type { BaseItem } from '../../api/library';
import { playUrl } from '../../api/tv';
import { Poster } from '../../components/Poster';
import { ItemCard } from '../../components/ItemCard';
import { formatRemaining, progressPercent } from '../../lib/format';
import { detailsUrl, paths, videoUrl } from '../../routes/paths';
import { ChapterCard, PersonCard, Scroller, Section, WideCard } from './cards';
import { CollectionItems, MoreFromSeason, PersonItems, PlaylistItems, SeasonEpisodes, SeriesChildren } from './children';
import { Icon } from './icons';
import { MoreMenu } from './MoreMenu';
import { TrackSelections, trackChoice, type Selection } from './TrackSelections';
import '../../ui/ui.css';
import '../home.css';
import './details.css';

export { isPlayable };

/** `#/details?id=…`: the details page for every item type, as jellyfin-web `itemDetails`. */
export function ItemDetail() {
  const [params] = useSearchParams();
  const itemId = params.get('id');
  const season = params.get('season');
  const { session, api } = useAuth();
  // The old series-with-season form opens that season's own page.
  if (season) return <Navigate to={detailsUrl(season)} replace />;
  if (!session || !api || !itemId) return null;
  return (
    <Detail
      key={itemId}
      api={api}
      serverUrl={session.serverUrl}
      token={session.accessToken}
      userId={session.userId}
      itemId={itemId}
    />
  );
}

function Detail(props: { api: Api; serverUrl: string; token: string; userId: string; itemId: string }) {
  const { api, serverUrl, userId, itemId } = props;
  const item = useQuery({ queryKey: ['item', userId, itemId], queryFn: () => fetchItem(api, userId, itemId) });
  const [toast, setToast] = useState<string | null>(null);
  // Version and tracks chosen in the selects; Play carries them to the player.
  const [sel, setSel] = useState<Selection>({});
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
  const backdrop = detailBackdropUrl(serverUrl, it);
  const logo = logoUrl(serverUrl, it);
  const ctx = { api, serverUrl, userId };
  return (
    <main className="detail" data-testid="item-detail" data-type={it.Type ?? ''}>
      <div className={backdrop ? 'detail-backdrop' : 'detail-backdrop is-empty'} aria-hidden="true">
        {backdrop && <img src={backdrop} alt="" />}
      </div>
      {logo && <img className="detail-logo" src={logo} alt="" aria-hidden="true" data-testid="detail-logo" />}

      <div className="detail-wrap">
        <div className="detail-primary">
          <div className="detail-poster">
            <Poster
              title={it.Name ?? ''}
              imageUrl={primaryImageUrl(serverUrl, it, 480)}
              blurhash={primaryBlurhash(it)}
              caption={false}
            />
          </div>
          <div className="detail-ribbon">
            <NameBlock item={it} />
            <MiscInfo item={it} />
            <Buttons {...props} item={it} sel={sel} toast={setToast} />
          </div>
        </div>

        <DetailContent item={it} sel={sel} onSel={setSel} />

        {it.Type === 'Series' && <SeriesChildren {...ctx} series={it} />}
        {it.Type === 'Season' && <SeasonEpisodes {...ctx} season={it} />}
        {it.Type === 'BoxSet' && <CollectionItems {...ctx} collection={it} />}
        {it.Type === 'Playlist' && <PlaylistItems {...ctx} playlist={it} />}
        {it.Type === 'Person' && <PersonItems {...ctx} person={it} />}

        <Secondary {...ctx} item={it} />
      </div>
      <div className="detail-toast" role="status" aria-live="polite">
        {toast && <span data-testid="toast">{toast}</span>}
      </div>
    </main>
  );
}

/** jellyfin-web `renderName`: an episode or season shows its series as the title, then "Season 1 - 2. Name". */
function NameBlock(props: { item: BaseItem }) {
  const it = props.item;
  const original = it.OriginalTitle && it.OriginalTitle !== it.Name ? <p className="detail-original">{it.OriginalTitle}</p> : null;
  if ((it.Type === 'Episode' || it.Type === 'Season') && it.SeriesId) {
    const name =
      it.Type === 'Episode'
        ? it.ParentIndexNumber === 0
          ? `Special - ${it.Name ?? ''}`
          : typeof it.IndexNumber === 'number'
            ? `${it.IndexNumber}. ${it.Name ?? ''}`
            : (it.Name ?? '')
        : (it.Name ?? '');
    return (
      <div className="detail-name" data-testid="detail-crumbs">
        <h1 className="detail-title">
          <Link to={detailsUrl(it.SeriesId)}>{it.SeriesName ?? 'Series'}</Link>
        </h1>
        <h2 className="detail-subtitle">
          {it.Type === 'Episode' && it.SeasonId ? (
            <>
              <Link to={detailsUrl(it.SeasonId)}>{it.SeasonName ?? 'Season'}</Link> - {name}
            </>
          ) : (
            name
          )}
        </h2>
        {original}
      </div>
    );
  }
  return (
    <div className="detail-name">
      <h1 className="detail-title">{it.Name}</h1>
      {original}
    </div>
  );
}

function MiscInfo(props: { item: BaseItem }) {
  const info = primaryMediaInfo(props.item);
  const progress = progressPercent(props.item.UserData?.PlaybackPositionTicks, props.item.RunTimeTicks);
  return (
    <>
      {info.length > 0 && (
        <p className="detail-meta" data-testid="detail-meta">
          {info.map((m) => (
            <span key={m.key} className={`detail-meta-item is-${m.key}`}>
              {m.text}
            </span>
          ))}
        </p>
      )}
      {isPlayable(props.item) && progress > 0 && !props.item.UserData?.Played && (
        <div className="detail-progress" data-testid="detail-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="readout">{formatRemaining(props.item.UserData?.PlaybackPositionTicks, props.item.RunTimeTicks)}</span>
        </div>
      )}
    </>
  );
}

/**
 * The detail buttons, in jellyfin-web's order: Resume or Play, Play from
 * the start, Trailer, Shuffle, Played, Favorite, More.
 */
function Buttons(props: {
  api: Api;
  serverUrl: string;
  token: string;
  userId: string;
  item: BaseItem;
  sel: Selection;
  toast: (m: string) => void;
}) {
  const { api, userId, item } = props;
  const itemId = item.Id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const tracks = trackChoice(item, props.sel);
  const resumable = isPlayable(item) && (item.UserData?.PlaybackPositionTicks ?? 0) > 0;
  const canPlay = isPlayable(item) || (playsChildren(item) && (item.ChildCount ?? item.RecursiveItemCount ?? 1) > 0);
  const shuffle = item.IsFolder && item.Type !== 'Person' && item.CollectionType !== 'livetv';
  const trailer = (item.LocalTrailerCount ?? 0) > 0 || (item.RemoteTrailers?.length ?? 0) > 0;
  const played = item.UserData?.Played ?? false;
  const favorite = item.UserData?.IsFavorite ?? false;
  const [busy, setBusy] = useState(false);

  const setUserData = useMutation({
    mutationFn: async (change: { kind: 'played' | 'favorite'; on: boolean }) => {
      const path = change.kind === 'played' ? '/UserPlayedItems/{itemId}' : '/UserFavoriteItems/{itemId}';
      const method = change.on ? api.POST : api.DELETE;
      const { data, error } = await method(path as never, { params: { path: { itemId }, query: { userId } } } as never);
      if (error !== undefined) throw new Error(`${change.kind} toggle failed`);
      return data;
    },
    onSuccess: () => {
      for (const key of ['item', 'resume', 'shelf', 'library', 'episodes', 'seasons', 'next-up', 'collection-items', 'person-items', 'playlist-items'])
        void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const go = async (pick: () => Promise<BaseItem | undefined>) => {
    setBusy(true);
    try {
      const target = await pick();
      if (target?.Id) navigate(playUrl(target));
      else props.toast('No Items are currently available.');
    } catch {
      props.toast('There was an error processing the request. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  const play = (fromStart: boolean) => {
    if (isPlayable(item)) navigate(videoUrl(itemId, fromStart ? 0 : item.UserData?.PlaybackPositionTicks, tracks));
    else void go(() => playTarget(api, userId, item));
  };

  const playTrailer = async () => {
    if ((item.LocalTrailerCount ?? 0) > 0) {
      await go(async () => (await fetchLocalTrailers(api, userId, itemId))[0]);
      return;
    }
    const url = item.RemoteTrailers?.[0]?.Url;
    if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="detail-buttons" role="group" aria-label="Actions">
      {canPlay && (
        <button
          type="button"
          className="detail-button is-play"
          title={resumable ? 'Resume' : 'Play'}
          aria-label={resumable ? 'Resume' : 'Play'}
          data-testid={resumable ? 'action-resume' : 'action-play'}
          disabled={busy}
          onClick={() => play(false)}
        >
          <Icon name="play" />
        </button>
      )}
      {resumable && (
        <button
          type="button"
          className="detail-button"
          title="Play"
          aria-label="Play from the start"
          data-testid="action-play"
          onClick={() => play(true)}
        >
          <Icon name="replay" />
        </button>
      )}
      {trailer && (
        <button type="button" className="detail-button" title="Trailer" aria-label="Trailer" data-testid="action-trailer" onClick={() => void playTrailer()}>
          <Icon name="trailer" />
        </button>
      )}
      {canPlay && shuffle && (
        <button
          type="button"
          className="detail-button"
          title="Shuffle"
          aria-label="Shuffle"
          data-testid="action-shuffle"
          disabled={busy}
          onClick={() => void go(() => shuffleTarget(api, userId, item))}
        >
          <Icon name="shuffle" />
        </button>
      )}
      {canMarkPlayed(item) && (
        <button
          type="button"
          className={played ? 'detail-button is-on' : 'detail-button'}
          title={played ? 'Played' : 'Mark played'}
          aria-label={played ? 'Played' : 'Mark played'}
          aria-pressed={played}
          data-testid="toggle-played"
          disabled={setUserData.isPending}
          onClick={() => setUserData.mutate({ kind: 'played', on: !played })}
        >
          <Icon name="check" />
        </button>
      )}
      {canRate(item) && (
        <button
          type="button"
          className={favorite ? 'detail-button is-on is-favorite' : 'detail-button'}
          title={favorite ? 'Favorite' : 'Add to favorites'}
          aria-label={favorite ? 'Favorite' : 'Add to favorites'}
          aria-pressed={favorite}
          data-testid="toggle-favorite"
          disabled={setUserData.isPending}
          onClick={() => setUserData.mutate({ kind: 'favorite', on: !favorite })}
        >
          <Icon name="favorite" />
        </button>
      )}
      {user.data && (
        <MoreMenu
          api={api}
          serverUrl={props.serverUrl}
          token={props.token}
          userId={userId}
          user={user.data}
          item={item}
          toast={props.toast}
        />
      )}
    </div>
  );
}

/** Track selects, tagline, overview, person dates, the Directors/Writers/Studios/Genres lines, links. */
function DetailContent(props: { item: BaseItem; sel: Selection; onSel: (s: Selection) => void }) {
  const it = props.item;
  const groups = detailsGroup(it);
  const links = (it.ExternalUrls ?? []).filter((l) => l.Url && /^https?:\/\//i.test(l.Url));
  return (
    <div className="detail-content">
      <TrackSelections item={it} value={props.sel} onChange={props.onSel} />
      {it.Taglines?.[0] && <h3 className="detail-tagline">{it.Taglines[0]}</h3>}
      {it.Overview && <Overview text={it.Overview} />}
      {it.Type === 'Person' && <PersonDates item={it} />}
      {groups.length > 0 && (
        <dl className="detail-group" data-testid="detail-group">
          {groups.map((g) => (
            <div key={g.label} className="detail-group-row">
              <dt>{g.label}</dt>
              <dd>
                {g.links.map((l, i) => (
                  <span key={`${l.to ?? l.name}-${i}`}>
                    {i > 0 && ', '}
                    {l.to ? <Link to={l.to}>{l.name}</Link> : l.name}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {links.length > 0 && (
        <p className="detail-links" data-testid="detail-links">
          <span className="detail-links-label">Links</span>
          {links.map((l, i) => (
            <span key={`${l.Name}-${i}`}>
              {i > 0 && ', '}
              <a href={l.Url!} target="_blank" rel="noopener noreferrer">
                {l.Name}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** The overview, clamped to a few lines with Show more / Show less when it overflows. */
function Overview(props: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(true);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(Math.abs(el.scrollHeight - el.offsetHeight) > 2);
  }, [props.text]);
  return (
    <div className="detail-overview-wrap">
      <p ref={ref} className={clamped ? 'detail-overview is-clamped' : 'detail-overview'} data-testid="detail-overview">
        {props.text}
      </p>
      {(overflows || !clamped) && (
        <button type="button" className="detail-more-link" onClick={() => setClamped((c) => !c)}>
          {clamped ? 'Show more' : 'Show less'}
        </button>
      )}
    </div>
  );
}

function years(from: Date, to: Date): number {
  let y = to.getFullYear() - from.getFullYear();
  if (to.getMonth() < from.getMonth() || (to.getMonth() === from.getMonth() && to.getDate() < from.getDate())) y--;
  return y;
}

/** "Born: …", "Birth place: …", "Died: …" (jellyfin-web `reloadFromItem`). */
function PersonDates(props: { item: BaseItem }) {
  const it = props.item;
  const born = it.PremiereDate ? new Date(it.PremiereDate) : null;
  const died = it.EndDate ? new Date(it.EndDate) : null;
  const place = it.ProductionLocations?.[0];
  return (
    <div className="detail-person" data-testid="person-dates">
      {born && (
        <p>
          Born: {born.toLocaleDateString()}
          {!died && ` (${years(born, new Date())} years old)`}
        </p>
      )}
      {place && (
        <p>
          Birth place:{' '}
          <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`} target="_blank" rel="noopener noreferrer">
            {place}
          </a>
        </p>
      )}
      {died && (
        <p>
          Died: {died.toLocaleDateString()}
          {born && ` (${years(born, died)} years old)`}
        </p>
      )}
    </div>
  );
}

/** Types that show More Like This (jellyfin-web `renderSimilarItems`), less the music ones (#95). */
const SIMILAR_TYPES = new Set(['Movie', 'Trailer', 'Series', 'Program', 'Recording', 'Playlist']);

/** The lower sections: More from Season, Cast & Crew, Guest Stars, Special Features, Scenes, More Like This. */
function Secondary(props: { api: Api; serverUrl: string; userId: string; item: BaseItem }) {
  const { api, serverUrl, userId, item } = props;
  const itemId = item.Id ?? '';
  const { cast, guests } = splitPeople(item.People ?? []);
  const specials = useQuery({
    queryKey: ['specials', userId, itemId],
    queryFn: () => fetchSpecialFeatures(api, userId, itemId),
    enabled: (item.SpecialFeatureCount ?? 0) > 0,
  });
  const similar = useQuery({
    queryKey: ['similar', userId, itemId],
    queryFn: () => fetchSimilar(api, userId, itemId),
    enabled: SIMILAR_TYPES.has(item.Type ?? ''),
  });
  const chapters = (item.Chapters ?? []).length && item.Chapters![0]!.ImageTag ? item.Chapters! : [];
  return (
    <>
      {item.Type === 'Episode' && <MoreFromSeason api={api} serverUrl={serverUrl} userId={userId} episode={item} />}
      {cast.length > 0 && (
        <Section title="Cast & Crew" testId="cast">
          <Scroller label="Cast & Crew">
            {cast.map((p, i) => (
              <PersonCard key={`${p.Id ?? p.Name}-${i}`} serverUrl={serverUrl} person={p} />
            ))}
          </Scroller>
        </Section>
      )}
      {guests.length > 0 && (
        <Section title="Guest Stars" testId="guest-cast">
          <Scroller label="Guest Stars">
            {guests.map((p, i) => (
              <PersonCard key={`${p.Id ?? p.Name}-${i}`} serverUrl={serverUrl} person={p} />
            ))}
          </Scroller>
        </Section>
      )}
      {(specials.data?.length ?? 0) > 0 && (
        <Section title="Special Features" testId="specials">
          <Scroller label="Special Features">
            {specials.data!.map((s) => (
              <WideCard key={s.Id} serverUrl={serverUrl} item={s} play />
            ))}
          </Scroller>
        </Section>
      )}
      {chapters.length > 0 && (
        <Section title="Scenes" testId="scenes">
          <Scroller label="Scenes">
            {chapters.map((c, i) => (
              <ChapterCard key={i} serverUrl={serverUrl} itemId={itemId} index={i} chapter={c} />
            ))}
          </Scroller>
        </Section>
      )}
      {(similar.data?.length ?? 0) > 0 && (
        <Section title="More Like This" testId="similar">
          <Scroller label="More Like This">
            {similar.data!.map((s) => (
              <div key={s.Id} role="listitem" className="scroller-card">
                <ItemCard serverUrl={serverUrl} item={s} />
              </div>
            ))}
          </Scroller>
        </Section>
      )}
    </>
  );
}
