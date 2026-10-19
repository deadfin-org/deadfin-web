import { lazy, Suspense, type ReactElement } from 'react';
import { Home } from '../pages/Home';
import { ItemDetail } from '../pages/ItemDetail';
import { LIBRARY_PATHS } from './paths';
import { QuickConnect } from '../pages/QuickConnect';

// Library, list and search pages load as their own chunk, so the first
// load (sign-in, Home) stays small. The chunk is fetched when the browser
// is idle, so opening a library does not wait for it.
const loadBrowse = () => import('../pages/library/browse');
const LibraryPage = lazy(() => loadBrowse().then((m) => ({ default: m.LibraryPage })));
const ListPage = lazy(() => loadBrowse().then((m) => ({ default: m.ListPage })));
const LegacyLibraryRedirect = lazy(() => loadBrowse().then((m) => ({ default: m.LegacyLibraryRedirect })));
const Search = lazy(() => loadBrowse().then((m) => ({ default: m.Search })));

if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
  idle(() => void loadBrowse());
}

const page = (el: ReactElement) => <Suspense fallback={null}>{el}</Suspense>;

/**
 * Signed-in pages inside the app bar and main drawer. Add one line per page.
 * The player (`/video`) has no app bar and lives in src/App.tsx.
 */
export const userRoutes: { path: string; element: ReactElement }[] = [
  { path: '/home', element: <Home /> },
  // One route per library type (`/movies`, `/tv`, …), as jellyfin-web.
  ...Object.values(LIBRARY_PATHS).map((path) => ({ path, element: page(<LibraryPage />) })),
  { path: '/list', element: page(<ListPage />) },
  { path: '/library/:viewId', element: page(<LegacyLibraryRedirect />) },
  { path: '/details', element: <ItemDetail /> },
  { path: '/search', element: page(<Search />) },
  { path: '/quickconnect', element: <QuickConnect /> },
];
