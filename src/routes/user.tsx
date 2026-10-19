import { lazy, Suspense, type ReactElement } from 'react';
import { Home } from '../pages/Home';
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

// The details page loads as its own chunk, fetched when the browser is
// idle, so the first load stays small and opening an item does not wait.
const loadDetails = () => import('../pages/details/ItemDetail');
const ItemDetail = lazy(() => loadDetails().then((m) => ({ default: m.ItemDetail })));
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
  idle(() => void loadDetails());
}

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
  { path: '/details', element: page(<ItemDetail />) },
  { path: '/search', element: page(<Search />) },
  { path: '/quickconnect', element: <QuickConnect /> },
];
