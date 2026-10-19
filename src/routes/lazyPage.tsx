import { lazy, Suspense, type ComponentType } from 'react';

/**
 * A route element whose page code loads on first visit, so admin pages do
 * not grow the main bundle.
 */
export function lazyPage(load: () => Promise<ComponentType>) {
  const Page = lazy(async () => ({ default: await load() }));
  return (
    <Suspense fallback={<p className="readout">Loading…</p>}>
      <Page />
    </Suspense>
  );
}
