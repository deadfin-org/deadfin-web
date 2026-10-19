/**
 * The dashboard drawer in jellyfin-web 12.0 order and words
 * (apps/dashboard/components/drawer/sections/*). Paths are relative to
 * `/dashboard`. The drawer shows an entry only when its path is a registered
 * route (src/routes/dashboard.tsx).
 */
export type DashboardNavEntry = { path: string; label: string; group?: string };
export type DashboardNavSection = { title: string; entries: DashboardNavEntry[] };

export const DASHBOARD_NAV: DashboardNavSection[] = [
  {
    title: 'Server',
    entries: [
      { path: '', label: 'Dashboard' },
      { path: 'settings', label: 'General' },
      { path: 'branding', label: 'Branding' },
      { path: 'users', label: 'Users' },
      { path: 'libraries', label: 'Libraries', group: 'Libraries' },
      { path: 'libraries/display', label: 'Display', group: 'Libraries' },
      { path: 'libraries/metadata', label: 'Metadata', group: 'Libraries' },
      { path: 'libraries/nfo', label: 'NFO Settings', group: 'Libraries' },
      { path: 'playback/transcoding', label: 'Transcoding', group: 'Playback' },
      { path: 'playback/resume', label: 'Resume', group: 'Playback' },
      { path: 'playback/streaming', label: 'Streaming', group: 'Playback' },
      { path: 'playback/trickplay', label: 'Trickplay', group: 'Playback' },
    ],
  },
  {
    title: 'Devices',
    entries: [
      { path: 'devices', label: 'Devices' },
      { path: 'activity', label: 'Activity' },
    ],
  },
  {
    title: 'Live TV',
    entries: [
      { path: 'livetv', label: 'Live TV' },
      { path: 'livetv/recordings', label: 'DVR' },
    ],
  },
  {
    title: 'Advanced',
    entries: [
      { path: 'networking', label: 'Networking' },
      { path: 'keys', label: 'API Keys' },
      { path: 'backups', label: 'Backups' },
      { path: 'logs', label: 'Logs' },
      { path: 'tasks', label: 'Scheduled Tasks' },
    ],
  },
  {
    title: 'Plugins',
    entries: [{ path: 'plugins', label: 'Plugins' }],
  },
];

/** The drawer sections limited to registered paths; empty sections drop out. */
export function visibleDashboardNav(registered: ReadonlySet<string>): DashboardNavSection[] {
  return DASHBOARD_NAV.map((s) => ({ ...s, entries: s.entries.filter((e) => registered.has(e.path)) })).filter(
    (s) => s.entries.length > 0,
  );
}
