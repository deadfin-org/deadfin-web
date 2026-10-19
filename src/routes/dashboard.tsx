import type { ReactElement } from 'react';
import { DashboardHome } from '../pages/dashboard/DashboardHome';
import { LiveTvGroups } from '../pages/LiveTvGroups';

/**
 * Dashboard routes, relative to `/dashboard`. Add one line per page; the
 * drawer (src/routes/dashboardNav.ts) shows the entries registered here.
 */
export const dashboardRoutes: { path: string; element: ReactElement }[] = [
  { path: '', element: <DashboardHome /> },
  { path: 'livetv', element: <LiveTvGroups /> },
];
