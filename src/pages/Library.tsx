import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import type { Api } from '../api/client';
import {
  countLabel,
  fetchLibraryPage,
  fetchUserViews,
  SORT_LABELS,
  type PlayedFilter,
  type SortKey,
} from '../api/library';
import { ItemCard } from '../components/ItemCard';
import './home.css';
import './library.css';

/** A multiple of the common column counts (2, 3, 4, 6), so full pages end rows evenly. */
export const PAGE_SIZE = 36;

export function Library() {
  const { viewId } = useParams<{ viewId: string }>();
  const { session, api } = useAuth();
  if (!session || !api || !viewId) return null;
  return <LibraryGrid api={api} serverUrl={session.serverUrl} userId={session.userId} viewId={viewId} />;
}

function LibraryGrid(props: { api: Api; serverUrl: string; userId: string; viewId: string }) {
  const { api, serverUrl, userId, viewId } = props;
  const [params, setParams] = useSearchParams();
  const sortBy = (params.get('sort') as SortKey | null) ?? 'SortName';
  const descending = params.get('order') === 'desc';
  const played = (params.get('played') as PlayedFilter | null) ?? 'all';
  const set = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const views = useQuery({ queryKey: ['user-views', userId], queryFn: () => fetchUserViews(api, userId) });
  const view = views.data?.find((v) => v.Id === viewId);
  const collectionType = view?.CollectionType ?? null;

  const items = useInfiniteQuery({
    queryKey: ['library', userId, viewId, sortBy, descending, played],
    enabled: views.isSuccess,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLibraryPage(api, {
        userId,
        viewId,
        collectionType,
        sortBy,
        descending,
        played,
        startIndex: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (last) => {
      const next = last.startIndex + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
  });

  // Load the next page when the end of the grid scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const all = items.data?.pages.flatMap((p) => p.items) ?? [];
  const total = items.data?.pages[0]?.total;

  return (
    <div className="home">
      <header className="page-bar library-bar">
        <h1 className="library-title">{view?.Name ?? 'Library'}</h1>
        <span className="readout" data-testid="library-count">
          {total === undefined ? '· · ·' : countLabel(total)}
        </span>
      </header>

      <div className="library-controls" role="group" aria-label="Sort and filter">
        <label className="readout">
          Sort{' '}
          <select value={sortBy} onChange={(e) => set('sort', e.target.value === 'SortName' ? null : e.target.value)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="library-order readout"
          aria-label={descending ? 'Descending, switch to ascending' : 'Ascending, switch to descending'}
          onClick={() => set('order', descending ? null : 'desc')}
        >
          {descending ? '↓ desc' : '↑ asc'}
        </button>
        <label className="readout">
          Show{' '}
          <select value={played} onChange={(e) => set('played', e.target.value === 'all' ? null : e.target.value)}>
            <option value="all">All</option>
            <option value="unplayed">Unplayed</option>
            <option value="played">Played</option>
          </select>
        </label>
      </div>

      <main className="home-main">
        {views.isError || items.isError ? (
          <p className="home-status readout" role="alert">
            This library could not be loaded.
          </p>
        ) : items.isPending ? (
          <p className="home-status readout">Loading…</p>
        ) : all.length === 0 ? (
          <p className="home-status readout" data-testid="library-empty">
            nothing here
          </p>
        ) : (
          <div className="shelf-grid" data-testid="library-grid">
            {all.map((item) => (
              <ItemCard key={item.Id} serverUrl={serverUrl} item={item} />
            ))}
          </div>
        )}
        <div ref={sentinel} />
        {hasNextPage && (
          <button
            className="library-more readout"
            data-testid="library-more"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </main>
    </div>
  );
}
