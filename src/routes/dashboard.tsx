import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { DashboardHome } from '../pages/dashboard/DashboardHome';
import { lazyPage } from './lazyPage';

type PlaybackPages = typeof import('../pages/dashboard/playbackPages');

/** A #85 page from the lazy playback/networking/Live TV chunk. */
function playbackPage(name: keyof PlaybackPages): ReactElement {
  const Page = lazy(() => import('../pages/dashboard/playbackPages').then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<p className="readout">Loading…</p>}>
      <Page />
    </Suspense>
  );
}

/**
 * Dashboard routes, relative to `/dashboard`. Add one line per page; the
 * drawer (src/routes/dashboardNav.ts) shows the entries registered here.
 */
export const dashboardRoutes: { path: string; element: ReactElement }[] = [
  { path: '', element: <DashboardHome /> },
  // #85: playback, networking, Live TV.
  { path: 'playback/transcoding', element: playbackPage('Transcoding') },
  { path: 'playback/resume', element: playbackPage('Resume') },
  { path: 'playback/streaming', element: playbackPage('Streaming') },
  { path: 'playback/trickplay', element: playbackPage('Trickplay') },
  { path: 'networking', element: playbackPage('Networking') },
  { path: 'livetv', element: playbackPage('LiveTv') },
  { path: 'livetv/tuner', element: playbackPage('TunerEdit') },
  { path: 'livetv/guide', element: playbackPage('GuideProvider') },
  // #86: Devices, Activity, API Keys, Logs.
  { path: 'devices', element: lazyPage(() => import('../pages/dashboard/Devices').then((m) => m.Devices)) },
  { path: 'activity', element: lazyPage(() => import('../pages/dashboard/Activity').then((m) => m.Activity)) },
  { path: 'keys', element: lazyPage(() => import('../pages/dashboard/ApiKeys').then((m) => m.ApiKeys)) },
  { path: 'logs', element: lazyPage(() => import('../pages/dashboard/Logs').then((m) => m.Logs)) },
  { path: 'logs/:file', element: lazyPage(() => import('../pages/dashboard/LogFile').then((m) => m.LogFile)) },
];
