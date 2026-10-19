import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import { fetchListPage, fetchUserViews, NO_FILTERS, type BaseItem, type ListQuery } from '../../api/library';
import {
  fetchLatest,
  fetchNextUpIn,
  fetchPlayed,
  fetchRecommendations,
  fetchResume,
  fetchUpcoming,
  groupByDay,
} from '../../api/sections';
import { ItemCard } from '../../components/ItemCard';
import { libraryUrl, listUrl } from '../../routes/paths';
import { Tabs } from '../../ui/Tabs';
import { LIST_KEYS, useListState, type ListState } from './listState';
import { Shelf } from './Shelf';
import { StreamedGrid, useStreamedList } from './StreamedGrid';
import { Toolbar } from './Toolbar';
import { libraryType, pickTab, type LibraryTab, type LibraryType, type SuggestionSection } from './views';
import '../home.css';
import '../library.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
  /** The library (user view) id; null when the page has none (Live TV without a view). */
  parentId: string | null;
}

/**
 * A library page at its jellyfin-web path (`#/movies?topParentId=…`), with
 * that library type's tabs. The tab is `?tab=` as in jellyfin-web.
 */
export function LibraryPage() {
  const { session, api } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const type = libraryType(location.pathname);
  const views = useQuery({
    queryKey: ['user-views', session?.userId],
    enabled: !!api && !!session,
    queryFn: () => fetchUserViews(api!, session!.userId),
  });
  if (!session || !api || !type) return null;

  const topParentId = params.get('topParentId');
  // jellyfin-web opens Live TV without an id (`#/livetv?collectionType=livetv`).
  const view = views.data?.find((v) => (topParentId ? v.Id === topParentId : v.CollectionType === type.collectionType));
  const parentId = topParentId ?? view?.Id ?? null;
  const tab = pickTab(type, params.get('tab'));
  const select = (i: number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const k of LIST_KEYS) next.delete(k);
        const t = type.tabs[i]!;
        if (t.index === type.tabs[0]!.index) next.delete('tab');
        else next.set('tab', String(t.index));
        return next;
      },
      { replace: true },
    );

  const ctx: Ctx = { api, serverUrl: session.serverUrl, userId: session.userId, parentId };
  // Live TV needs its view id; wait for the views, then say so if there is none.
  const waiting = !topParentId && views.isPending;
  return (
    <div className="home">
      <header className="page-bar library-bar">
        <h1 className="library-title">{view?.Name ?? (type.collectionType === 'livetv' ? 'Live TV' : 'Library')}</h1>
      </header>
      {type.tabs.length > 1 && (
        <div className="library-tabs">
          <Tabs labels={type.tabs.map((t) => t.label)} label={view?.Name ?? 'Library'} selected={type.tabs.indexOf(tab)} onSelect={select} />
        </div>
      )}
      <main className="home-main">
        {waiting ? (
          <p className="home-status readout">Loading…</p>
        ) : !parentId && type.collectionType === 'livetv' ? (
          <p className="home-status readout" data-testid="library-empty">
            Live TV is not set up. An administrator adds tuners in Dashboard → Live TV.
          </p>
        ) : (
          <TabContent key={`${type.path}-${tab.index}-${parentId}`} type={type} tab={tab} ctx={ctx} />
        )}
      </main>
    </div>
  );
}

function TabContent(props: { type: LibraryType; tab: LibraryTab; ctx: Ctx }) {
  const { tab, ctx } = props;
  switch (tab.kind) {
    case 'items':
    case 'channels':
      return <ItemsTab tab={tab} ctx={ctx} />;
    case 'suggestions':
      return <SuggestionsTab sections={tab.sections ?? []} ctx={ctx} />;
    case 'genres':
      return <GenresTab tab={tab} ctx={ctx} />;
    case 'studios':
      return <StudiosTab tab={tab} ctx={ctx} />;
    case 'upcoming':
      return <UpcomingTab ctx={ctx} />;
  }
}

function listQuery(ctx: Ctx, tab: Pick<LibraryTab, 'itemTypes' | 'folders' | 'favorites'>, s: ListState, startIndex: number, limit: number): ListQuery {
  return {
    userId: ctx.userId,
    parentId: ctx.parentId,
    itemTypes: tab.itemTypes,
    recursive: !tab.folders,
    sortBy: s.sortBy,
    descending: s.descending,
    filters: s.filters,
    letter: s.letter,
    isFavorite: tab.favorites,
    // jellyfin-web hides missing episodes in the Episodes tab.
    isMissing: tab.itemTypes?.length === 1 && tab.itemTypes[0] === 'Episode' ? false : undefined,
    startIndex,
    limit,
  };
}

/** A streamed tab: Movies, Shows, Episodes, Favorites, Collections, Playlists, Folders, Channels… */
function ItemsTab({ tab, ctx }: { tab: LibraryTab; ctx: Ctx }) {
  const sorts = tab.sorts ?? 'mixed';
  const [state, setState] = useListState(sorts);
  // Live TV channels keep the plain by-name children query: the fast path for 40k channels.
  const channels = tab.kind === 'channels';
  const list = useStreamedList(['library', ctx.userId, ctx.parentId, tab.index, tab.source ?? 'items', tab.itemTypes, state], (start, limit) =>
    fetchListPage(ctx.api, tab.source ?? 'items', listQuery(ctx, tab, state, start, limit)),
  );
  return (
    <div className="library-list">
      <Toolbar
        total={list.total}
        state={state}
        onChange={setState}
        sorts={channels ? undefined : tab.sorts}
        filters={tab.filters}
        alphabet={tab.alphabet}
        parentId={ctx.parentId}
        itemTypes={tab.itemTypes}
      />
      <StreamedGrid list={list} empty={tab.empty} render={(item) => <ItemCard serverUrl={ctx.serverUrl} item={item} />} />
    </div>
  );
}

/** Suggestions: rows of resume, latest, next up and recommendations for this library. */
function SuggestionsTab({ sections, ctx }: { sections: SuggestionSection[]; ctx: Ctx }) {
  return (
    <>
      {sections.map((s, i) => (
        <SuggestionRow key={i} section={s} ctx={ctx} />
      ))}
    </>
  );
}

function SuggestionRow({ section, ctx }: { section: SuggestionSection; ctx: Ctx }) {
  const parentId = ctx.parentId ?? undefined;
  const q = useQuery({
    queryKey: ['suggestions', ctx.userId, parentId, section],
    queryFn: async (): Promise<{ title: string; items: BaseItem[] }[]> => {
      switch (section.kind) {
        case 'resume':
          return [{ title: section.title, items: await fetchResume(ctx.api, ctx.userId, { mediaType: section.mediaType, parentId }) }];
        case 'latest':
          return [{ title: section.title, items: await fetchLatest(ctx.api, ctx.userId, { parentId, itemTypes: section.itemTypes }) }];
        case 'nextUp':
          return [{ title: section.title, items: await fetchNextUpIn(ctx.api, ctx.userId, { parentId }) }];
        case 'played':
          return [{ title: section.title, items: await fetchPlayed(ctx.api, ctx.userId, { ...section, parentId }) }];
        case 'recommendations':
          return fetchRecommendations(ctx.api, ctx.userId, parentId);
      }
    },
  });
  if (q.isError) return null;
  if (!q.data) return section.kind === 'recommendations' ? null : <Shelf title={section.title} pending serverUrl={ctx.serverUrl} />;
  return (
    <>
      {q.data.map((row) => (
        <Shelf key={row.title} title={row.title} items={row.items} serverUrl={ctx.serverUrl} testId="suggestion-row" />
      ))}
    </>
  );
}

/**
 * Genres: one row per genre, as jellyfin-web. Genres stream in pages; a
 * row asks for its items only when it scrolls near the screen.
 */
function GenresTab({ tab, ctx }: { tab: LibraryTab; ctx: Ctx }) {
  const list = useStreamedList(['genres', ctx.userId, ctx.parentId, tab.itemTypes], (start, limit) =>
    fetchListPage(ctx.api, 'genres', listQuery(ctx, { itemTypes: tab.itemTypes }, NO_STATE, start, limit)),
  );
  return (
    <StreamedGrid
      list={list}
      className="genre-rows"
      empty="No Items are currently available."
      render={(genre) => <GenreRow genre={genre} tab={tab} ctx={ctx} />}
    />
  );
}

const NO_STATE: ListState = { sortBy: ['SortName'], descending: false, filters: NO_FILTERS, letter: null };

function GenreRow({ genre, tab, ctx }: { genre: BaseItem; tab: LibraryTab; ctx: Ctx }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref);
  const q = useQuery({
    queryKey: ['genre-row', ctx.userId, ctx.parentId, genre.Id, tab.itemTypes],
    enabled: near,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (
        await fetchListPage(ctx.api, 'items', {
          ...listQuery(ctx, { itemTypes: tab.itemTypes }, { ...NO_STATE, sortBy: ['Random'] }, 0, 25),
          genreIds: [genre.Id ?? ''],
        })
      ).items,
  });
  const to = listUrl({ genreId: genre.Id, parentId: ctx.parentId, type: tab.itemTypes?.join(',') });
  return (
    <div ref={ref} className="genre-row" data-testid="genre-row">
      <Shelf title={genre.Name ?? 'Genre'} to={to} items={q.data} pending={!q.data} serverUrl={ctx.serverUrl} testId="genre-shelf" />
    </div>
  );
}

/** True once the element comes within 600px of the screen (then stays true). */
function useNear(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

/** Studios (TV Networks): a streamed grid; a studio opens its items. */
function StudiosTab({ tab, ctx }: { tab: LibraryTab; ctx: Ctx }) {
  const [state, setState] = useListState('mixed');
  const list = useStreamedList(['studios', ctx.userId, ctx.parentId, tab.itemTypes, state.letter], (start, limit) =>
    fetchListPage(ctx.api, 'studios', listQuery(ctx, { itemTypes: tab.itemTypes }, state, start, limit)),
  );
  return (
    <div className="library-list">
      <Toolbar total={list.total} state={state} onChange={setState} alphabet />
      <StreamedGrid
        list={list}
        render={(s) => (
          <ItemCard
            serverUrl={ctx.serverUrl}
            item={s}
            to={listUrl({ studioId: s.Id, parentId: ctx.parentId, type: tab.itemTypes?.join(',') })}
          />
        )}
      />
    </div>
  );
}

/** Upcoming episodes, grouped by air date. */
function UpcomingTab({ ctx }: { ctx: Ctx }) {
  const q = useQuery({
    queryKey: ['upcoming', ctx.userId, ctx.parentId],
    queryFn: () => fetchUpcoming(ctx.api, ctx.userId, ctx.parentId ?? undefined),
  });
  if (q.isError)
    return (
      <p className="home-status readout" role="alert">
        This list could not be loaded.
      </p>
    );
  if (!q.data) return <p className="home-status readout">Loading…</p>;
  if (q.data.length === 0)
    return (
      <p className="home-status readout" data-testid="library-empty">
        No Items are currently available.
      </p>
    );
  return (
    <>
      {groupByDay(q.data).map((g) => (
        <Shelf key={g.label} title={g.label} items={g.items} serverUrl={ctx.serverUrl} />
      ))}
    </>
  );
}

/**
 * The old `#/library/:id` path: once the views are known it goes to the
 * jellyfin-web path for that library, or to the plain list for any other id.
 */
export function LegacyLibraryRedirect() {
  const { viewId } = useParams<{ viewId: string }>();
  const { session, api } = useAuth();
  const views = useQuery({
    queryKey: ['user-views', session?.userId],
    enabled: !!api && !!session,
    queryFn: () => fetchUserViews(api!, session!.userId),
  });
  if (!viewId) return <Navigate to="/home" replace />;
  if (views.isPending) return null;
  const view = views.data?.find((v) => v.Id === viewId);
  return <Navigate to={view ? libraryUrl(view) : listUrl({ parentId: viewId })} replace />;
}
