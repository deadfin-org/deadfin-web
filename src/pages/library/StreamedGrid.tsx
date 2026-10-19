import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { BaseItem, Page } from '../../api/library';

/** A multiple of the common column counts (2, 3, 4, 6), so full pages end rows evenly. */
export const PAGE_SIZE = 36;

/**
 * The streamed list every long list is built on: pages of 36 from
 * `fetchPage`, the next page when the end scrolls within 600px. Posters
 * load lazily (Poster), so 40,000 rows cost one page plus what is on screen.
 */
export function useStreamedList(key: QueryKey, fetchPage: (startIndex: number, limit: number) => Promise<Page>, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(pageParam, PAGE_SIZE),
    getNextPageParam: (last) => {
      const next = last.startIndex + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
  });
  const all = query.data?.pages.flatMap((p) => p.items) ?? [];
  const first = query.data?.pages[0];
  // An endpoint without a total gives MAX_SAFE_INTEGER until its short last page.
  const total = first && first.total !== Number.MAX_SAFE_INTEGER ? first.total : undefined;
  return { query, all, total };
}

export function StreamedGrid(props: {
  list: ReturnType<typeof useStreamedList>;
  render: (item: BaseItem) => ReactNode;
  empty?: string;
  className?: string;
}) {
  const { query, all } = props.list;
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      {query.isError ? (
        <p className="home-status readout" role="alert">
          This list could not be loaded.
        </p>
      ) : query.isPending ? (
        <p className="home-status readout">Loading…</p>
      ) : all.length === 0 ? (
        <p className="home-status readout" data-testid="library-empty">
          {props.empty ?? 'No Items are currently available.'}
        </p>
      ) : (
        <div className={props.className ?? 'shelf-grid'} data-testid="library-grid">
          {all.map((item, i) => (
            <Fragment key={item.Id ?? i}>{props.render(item)}</Fragment>
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
    </>
  );
}
