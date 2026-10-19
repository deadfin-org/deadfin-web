import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Rows rendered per step, the same as a library page (src/pages/Library.tsx). */
export const STREAM_STEP = 36;

/**
 * Calls `onReach` when an end-of-list sentinel comes within 600px of the
 * viewport. The ref goes on an empty element after the last row.
 */
export function useSentinel(onReach: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const reach = useRef(onReach);
  reach.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) reach.current();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

/**
 * A list the server returns whole (users, tasks) rendered the way the library
 * page streams: the first rows at once, more as the end scrolls near. A long
 * list never blocks the first paint.
 */
export function StreamedList<T>(props: {
  items: T[];
  render: (item: T) => ReactNode;
  className?: string;
  as?: 'ul' | 'div';
  testId?: string;
}) {
  const [shown, setShown] = useState(STREAM_STEP);
  const more = shown < props.items.length;
  const sentinel = useSentinel(() => setShown((n) => n + STREAM_STEP), more);
  const Tag = props.as ?? 'div';
  return (
    <>
      <Tag className={props.className} data-testid={props.testId}>
        {props.items.slice(0, shown).map(props.render)}
      </Tag>
      <div ref={sentinel} />
      {more && (
        <button type="button" className="button-plain list-more" onClick={() => setShown((n) => n + STREAM_STEP)}>
          Load more
        </button>
      )}
    </>
  );
}
