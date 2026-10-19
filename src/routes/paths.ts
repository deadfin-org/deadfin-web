/**
 * Route paths in jellyfin-web 12.0 form, so a Jellyfin user's links and
 * habits carry over (`#/home`, `#/details?id=`, `#/video`, `#/dashboard/…`).
 */
export const paths = {
  home: '/home',
  favorites: '/home?tab=1',
  search: '/search',
  quickConnect: '/quickconnect',
  dashboard: '/dashboard',
  login: '/login',
} as const;

/** Item detail page; a season opens on its series with that season selected. */
export function detailsUrl(id: string, opts: { season?: string | null } = {}): string {
  const q = new URLSearchParams({ id });
  if (opts.season) q.set('season', opts.season);
  return `/details?${q.toString()}`;
}

/** Video player; `startTicks` resumes at that position. */
export function videoUrl(id: string, startTicks?: number | null): string {
  const q = new URLSearchParams({ id });
  if (startTicks && startTicks > 0) q.set('t', String(startTicks));
  return `/video?${q.toString()}`;
}

export function libraryUrl(viewId: string): string {
  return `/library/${viewId}`;
}

/** Old deadfin-web paths and their jellyfin-web form; `null` when the path is not an old one. */
export function legacyRedirect(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  let m = /^\/item\/([^/]+)$/.exec(pathname);
  if (m) return detailsUrl(decodeURIComponent(m[1]!), { season: q.get('season') });
  m = /^\/play\/([^/]+)$/.exec(pathname);
  if (m) return videoUrl(decodeURIComponent(m[1]!), Number(q.get('t') ?? 0) || 0);
  if (pathname === '/admin/livetv') return '/dashboard/livetv';
  if (pathname === '/' || pathname === '') return paths.home;
  return null;
}
