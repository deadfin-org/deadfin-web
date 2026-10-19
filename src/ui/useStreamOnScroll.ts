import { useEffect, useRef } from 'react';

/**
 * The streamed-list trigger from the library grid: a sentinel element at the
 * end of a list calls `loadMore` when it comes within 600px of the viewport.
 * Attach the returned ref to an empty element after the last row.
 */
export function useStreamOnScroll(hasMore: boolean, busy: boolean, loadMore: () => void) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !busy) loadMore();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, busy, loadMore]);
  return sentinel;
}
