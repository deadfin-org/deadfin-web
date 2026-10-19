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

/** Library page path per collection type, as jellyfin-web `appRouter.getRouteUrl`. */
export const LIBRARY_PATHS: Record<string, string> = {
  movies: '/movies',
  tvshows: '/tv',
  music: '/music',
  boxsets: '/boxsets',
  playlists: '/playlists',
  homevideos: '/homevideos',
  musicvideos: '/musicvideos',
  books: '/books',
  livetv: '/livetv',
  mixed: '/mixed',
};

type ViewRef = { Id?: string | null; CollectionType?: string | null };

/**
 * A library (user view) page: `#/movies?topParentId=…&collectionType=movies`.
 * A bare id gives the old `/library/:id` path, which redirects once the
 * user's views are known.
 */
export function libraryUrl(view: ViewRef | string, opts: { tab?: number } = {}): string {
  if (typeof view === 'string') return `/library/${encodeURIComponent(view)}`;
  const type = view.CollectionType || 'mixed';
  const path = LIBRARY_PATHS[type];
  if (!path || type === 'folders') return listUrl({ parentId: view.Id ?? '' });
  const q = new URLSearchParams();
  if (view.Id) q.set('topParentId', view.Id);
  q.set('collectionType', type);
  if (opts.tab) q.set('tab', String(opts.tab));
  return `${path}?${q.toString()}`;
}

/** The generic item list (`#/list?…`): folder children, a genre, a studio, favorites of a type. */
export function listUrl(query: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  return `/list?${q.toString()}`;
}

type LinkItem = ViewRef & { Type?: string | null; IsFolder?: boolean | null };

/** Types that open their details page even though they are folders (jellyfin-web `appRouter`). */
const DETAIL_FOLDERS = new Set([
  'Playlist',
  'TvChannel',
  'Program',
  'BoxSet',
  'MusicAlbum',
  'MusicGenre',
  'Person',
  'Recording',
  'MusicArtist',
  'Series',
  'Season',
]);

/** Where a card for this item leads. */
export function itemUrl(item: LinkItem, opts: { parentId?: string | null } = {}): string {
  const id = item.Id ?? '';
  switch (item.Type) {
    case 'CollectionFolder':
    case 'UserView':
      return libraryUrl(item);
    case 'Genre':
      return listUrl({ genreId: id, parentId: opts.parentId });
    case 'Studio':
      return listUrl({ studioId: id, parentId: opts.parentId });
  }
  if (item.IsFolder && !DETAIL_FOLDERS.has(item.Type ?? '')) return listUrl({ parentId: id });
  return detailsUrl(id);
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
