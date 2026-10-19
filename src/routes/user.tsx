import type { ReactElement } from 'react';
import { Home } from '../pages/Home';
import { ItemDetail } from '../pages/ItemDetail';
import { Library } from '../pages/Library';
import { QuickConnect } from '../pages/QuickConnect';
import { Search } from '../pages/Search';

/**
 * Signed-in pages inside the app bar and main drawer. Add one line per page.
 * The player (`/video`) has no app bar and lives in src/App.tsx.
 */
export const userRoutes: { path: string; element: ReactElement }[] = [
  { path: '/home', element: <Home /> },
  { path: '/library/:viewId', element: <Library /> },
  { path: '/details', element: <ItemDetail /> },
  { path: '/search', element: <Search /> },
  { path: '/quickconnect', element: <QuickConnect /> },
];
