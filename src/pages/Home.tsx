import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { primaryImageUrl, type Api } from '../api/client';
import { useCurrentUser, useIsAdmin } from '../api/currentUser';
import { fetchListPage, fetchUserViews, NO_FILTERS, type BaseItem, type ItemKind, type ListSource } from '../api/library';
import {
  fetchActiveRecordings,
  fetchHomeSections,
  fetchLatest,
  fetchNextUpIn,
  fetchOnNow,
  fetchResume,
  DEFAULT_SECTIONS,
  type HomeSection,
  type ResumeMedia,
} from '../api/sections';
import { Shelf } from './library/Shelf';
import { libraryUrl, listUrl } from '../routes/paths';
import { Tabs, useTabParam } from '../ui/Tabs';
import './home.css';
import './library.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
}

/** Home, with jellyfin-web's two tabs: Home and Favorites (`?tab=1`). */
export function Home() {
  const { session, api } = useAuth();
  const [tab, setTab] = useTabParam(2);
  if (!session || !api) return null;
  const ctx: Ctx = { api, serverUrl: session.serverUrl, userId: session.userId };
  return (
    <div className="home">
      <div className="library-tabs">
        <Tabs labels={['Home', 'Favorites']} label="Home" selected={tab} onSelect={setTab} />
      </div>
      <main className="home-main" data-testid="home">
        {tab === 0 ? <HomeSections ctx={ctx} /> : <Favorites ctx={ctx} />}
      </main>
    </div>
  );
}

/**
 * The home sections in the user's order (homesection0–9, shared with
 * jellyfin-web). Every section asks for its own data at once; while the
 * order loads, the default order shows, so nothing waits on it.
 */
function HomeSections({ ctx }: { ctx: Ctx }) {
  const views = useQuery({ queryKey: ['user-views', ctx.userId], queryFn: () => fetchUserViews(ctx.api, ctx.userId) });
  const order = useQuery({
    queryKey: ['home-sections', ctx.userId],
    queryFn: () => fetchHomeSections(ctx.api, ctx.userId),
    staleTime: 5 * 60_000,
  });
  const isAdmin = useIsAdmin();

  if (views.isError)
    return (
      <p className="home-status readout" role="alert">
        The server did not answer.
      </p>
    );
  if (views.data && views.data.length === 0)
    return (
      <div className="home-status" data-testid="empty-views">
        <h2>Nothing here.</h2>
        <p className="readout">
          {isAdmin ? (
            <>
              No libraries yet. <Link to="/dashboard/libraries">Add one in the Dashboard.</Link>
            </>
          ) : (
            'Ask an administrator to create a library.'
          )}
        </p>
      </div>
    );

  const sections = order.data ?? DEFAULT_SECTIONS;
  const seen = new Set<HomeSection>();
  return (
    <>
      {sections.map((s, i) => {
        // A section listed twice shows once.
        if (s === 'none' || seen.has(s)) return null;
        seen.add(s);
        return <Section key={`${s}-${i}`} section={s} ctx={ctx} views={views.data} />;
      })}
    </>
  );
}

function Section({ section, ctx, views }: { section: HomeSection; ctx: Ctx; views?: BaseItem[] }) {
  switch (section) {
    case 'smalllibrarytiles':
      return <MyMedia views={views} serverUrl={ctx.serverUrl} />;
    case 'librarybuttons':
      return <MyMedia views={views} serverUrl={ctx.serverUrl} buttons />;
    case 'resume':
      return <ResumeSection ctx={ctx} media="Video" title="Continue Watching" testId="resume-shelf" />;
    case 'resumeaudio':
      return <ResumeSection ctx={ctx} media="Audio" title="Continue Listening" testId="resume-audio-shelf" />;
    case 'resumebook':
      return <ResumeSection ctx={ctx} media="Book" title="Continue Reading" testId="resume-book-shelf" />;
    case 'nextup':
      return <NextUpSection ctx={ctx} />;
    case 'latestmedia':
      return <LatestSections ctx={ctx} views={views} />;
    case 'livetv':
      return <LiveTvSection ctx={ctx} views={views} />;
    case 'activerecordings':
      return <ActiveRecordings ctx={ctx} />;
    case 'none':
      return null;
  }
}

/** My Media: one tile per library, as jellyfin-web `smalllibrarytiles` (or plain buttons). */
function MyMedia({ views, serverUrl, buttons }: { views?: BaseItem[]; serverUrl: string; buttons?: boolean }) {
  if (!views || views.length === 0) return null;
  return (
    <section className="shelf" data-testid="my-media">
      <h2 className="shelf-head">
        <span className="shelf-name">My Media</span>
      </h2>
      <div className={buttons ? 'library-buttons' : 'shelf-row library-tiles'}>
        {views.map((v) => {
          const img = buttons ? '' : primaryImageUrl(serverUrl, v, 480);
          return (
            <Link key={v.Id} to={libraryUrl(v)} className={buttons ? 'library-order readout' : 'library-tile'} data-testid="library-tile">
              {!buttons && <span className="library-tile-frame">{img && <img src={img} alt="" loading="lazy" />}</span>}
              <span className="library-tile-name">{v.Name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ResumeSection({ ctx, media, title, testId }: { ctx: Ctx; media: ResumeMedia; title: string; testId: string }) {
  const q = useQuery({
    queryKey: ['resume', ctx.userId, media],
    queryFn: () => fetchResume(ctx.api, ctx.userId, { mediaType: media }),
  });
  return <Shelf title={title} items={q.data} serverUrl={ctx.serverUrl} testId={testId} />;
}

function NextUpSection({ ctx }: { ctx: Ctx }) {
  const q = useQuery({ queryKey: ['next-up', ctx.userId], queryFn: () => fetchNextUpIn(ctx.api, ctx.userId, {}) });
  return <Shelf title="Next Up" to={listUrl({ type: 'nextup' })} items={q.data} serverUrl={ctx.serverUrl} testId="next-up-shelf" />;
}

/** Library types with no Recently Added row, as jellyfin-web. */
const NO_LATEST = new Set(['playlists', 'livetv', 'boxsets', 'channels', 'folders']);
/** The tab a Recently Added title opens (Suggestions). */
const LATEST_TAB: Record<string, number> = { movies: 1, tvshows: 1, music: 1, musicvideos: 1, mixed: 1, books: 3 };

function LatestSections({ ctx, views }: { ctx: Ctx; views?: BaseItem[] }) {
  const me = useCurrentUser();
  if (!views) return <p className="home-status readout">Loading…</p>;
  const excluded = new Set(me.data?.Configuration?.LatestItemsExcludes ?? []);
  return (
    <>
      {views
        .filter((v) => v.Id && !excluded.has(v.Id) && !NO_LATEST.has(v.CollectionType ?? ''))
        .map((v) => (
          <LatestRow key={v.Id} ctx={ctx} view={v} />
        ))}
    </>
  );
}

function LatestRow({ ctx, view }: { ctx: Ctx; view: BaseItem }) {
  const q = useQuery({
    queryKey: ['latest', ctx.userId, view.Id],
    queryFn: () => fetchLatest(ctx.api, ctx.userId, { parentId: view.Id ?? undefined }),
  });
  if (q.isError)
    return (
      <p className="home-status readout" role="alert">
        {view.Name} could not be loaded.
      </p>
    );
  return (
    <Shelf
      title={`Recently Added in ${view.Name ?? 'Library'}`}
      to={libraryUrl(view, { tab: LATEST_TAB[view.CollectionType || 'mixed'] })}
      items={q.data}
      pending={q.isPending}
      serverUrl={ctx.serverUrl}
    />
  );
}

/** Live TV: a link to the channels and the On Now row; only when the server has a Live TV library. */
function LiveTvSection({ ctx, views }: { ctx: Ctx; views?: BaseItem[] }) {
  const view = views?.find((v) => v.CollectionType === 'livetv');
  const onNow = useQuery({
    queryKey: ['on-now', ctx.userId],
    enabled: !!view,
    queryFn: () => fetchOnNow(ctx.api, ctx.userId),
  });
  if (!view) return null;
  return (
    <>
      <Shelf
        title="Live TV"
        serverUrl={ctx.serverUrl}
        testId="live-tv-section"
        extra={
          <div className="library-buttons">
            <Link to={libraryUrl(view, { tab: 2 })} className="library-order readout">
              Channels
            </Link>
          </div>
        }
      />
      <Shelf title="On Now" items={onNow.data} serverUrl={ctx.serverUrl} testId="on-now-shelf" />
    </>
  );
}

function ActiveRecordings({ ctx }: { ctx: Ctx }) {
  const q = useQuery({ queryKey: ['active-recordings', ctx.userId], queryFn: () => fetchActiveRecordings(ctx.api, ctx.userId) });
  return <Shelf title="Active Recordings" items={q.data} serverUrl={ctx.serverUrl} />;
}

/** The Favorites tab rows, as jellyfin-web `favoriteitems`. */
const FAVORITE_ROWS: { title: string; types: ItemKind[]; source?: ListSource }[] = [
  { title: 'Movies', types: ['Movie'] },
  { title: 'Shows', types: ['Series'] },
  { title: 'Episodes', types: ['Episode'] },
  { title: 'Videos', types: ['Video', 'MusicVideo'] },
  { title: 'Artists', types: ['MusicArtist'], source: 'artists' },
  { title: 'Albums', types: ['MusicAlbum'] },
  { title: 'Songs', types: ['Audio'] },
];

function Favorites({ ctx }: { ctx: Ctx }) {
  const results = useQueries({
    queries: FAVORITE_ROWS.map((r) => ({
      queryKey: ['favorites', ctx.userId, r.types],
      queryFn: async () => (await fetchListPage(ctx.api, r.source ?? 'items', favoriteQuery(ctx, r.types))).items,
    })),
  });
  const none = results.every((q) => !q.isPending && !q.data?.length);
  return (
    <>
      {FAVORITE_ROWS.map((r, i) => (
        <Shelf
          key={r.title}
          title={r.title}
          to={listUrl({ type: r.types.join(','), IsFavorite: 'true' })}
          items={results[i]!.data}
          serverUrl={ctx.serverUrl}
          testId="favorites-row"
        />
      ))}
      {none && (
        <p className="home-status readout" data-testid="favorites-empty">
          No favorites are currently available.
        </p>
      )}
    </>
  );
}

function favoriteQuery(ctx: Ctx, types: ItemKind[]) {
  return {
    userId: ctx.userId,
    itemTypes: types,
    recursive: true,
    isFavorite: true,
    sortBy: ['SortName' as const],
    descending: false,
    filters: NO_FILTERS,
    startIndex: 0,
    limit: 20,
  };
}
