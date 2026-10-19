import { useEffect, useRef } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Page } from '../../api/items';

/** A multiple of the common column counts (2, 3, 4, 6), so full pages end rows evenly. */
export const PAGE_SIZE = 36;

/**
 * The streamed list (as the library grid): pages of 36 from `fetchPage`,
 * the next page when the end comes within 600px of the screen. Images load
 * lazily, so a long list costs one page plus what is on screen.
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
  const total = query.data?.pages[0]?.total;
  return { query, all, total };
}

export type StreamedList = ReturnType<typeof useStreamedList>;

/** Put at the end of a streamed list: loads the next page when it nears the screen. */
export function StreamSentinel(props: { list: StreamedList }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = props.list.query;
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
      <div ref={sentinel} className="stream-sentinel" />
      {hasNextPage && (
        <button
          type="button"
          className="stream-more readout"
          data-testid="stream-more"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
