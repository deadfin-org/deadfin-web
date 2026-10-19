import type { Api } from './client';
import type { BaseItem, ItemKind } from './library';

/** Result groups in jellyfin-web 12.0 order (`SEARCH_SECTIONS_SORT_ORDER`). */
export const SEARCH_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Movies', types: ['Movie'] },
  { label: 'Shows', types: ['Series'] },
  { label: 'Episodes', types: ['Episode'] },
  { label: 'People', types: ['Person'] },
  { label: 'Studios', types: ['Studio'] },
  { label: 'Playlists', types: ['Playlist'] },
  { label: 'Artists', types: ['MusicArtist'] },
  { label: 'Albums', types: ['MusicAlbum'] },
  { label: 'Songs', types: ['Audio'] },
  { label: 'Videos', types: ['Video', 'MusicVideo'] },
  { label: 'Channels', types: ['TvChannel'] },
  { label: 'Photo Albums', types: ['PhotoAlbum'] },
  { label: 'Photos', types: ['Photo'] },
  { label: 'Audiobooks', types: ['AudioBook'] },
  { label: 'Books', types: ['Book'] },
  { label: 'Collections', types: ['BoxSet'] },
];

/** Item types the main /Items search asks for (channels have their own capped request). */
export const ITEM_SEARCH_TYPES: ItemKind[] = [
  'Movie',
  'Series',
  'Episode',
  'Playlist',
  'MusicAlbum',
  'Audio',
  'Video',
  'MusicVideo',
  'PhotoAlbum',
  'Photo',
  'AudioBook',
  'Book',
  'BoxSet',
];

export const SEARCH_LIMIT = 200;
/** People, studios, artists and channels: one row each, so a small cap. */
export const ROW_LIMIT = 24;

const CARD = {
  enableUserData: true,
  imageTypeLimit: 1,
  enableImageTypes: ['Primary' as const],
  enableTotalRecordCount: false,
};

export function searchQuery(userId: string, term: string) {
  return {
    userId,
    searchTerm: term,
    recursive: true,
    includeItemTypes: ITEM_SEARCH_TYPES,
    isMissing: false,
    limit: SEARCH_LIMIT,
    ...CARD,
  };
}

export interface SearchGroup {
  label: string;
  items: BaseItem[];
}

/** Splits results into SEARCH_GROUPS order, keeping the server's ranking within each; empty groups drop out. */
export function groupResults(items: BaseItem[]): SearchGroup[] {
  return SEARCH_GROUPS.map((g) => ({ label: g.label, items: items.filter((i) => g.types.includes(i.Type ?? '')) })).filter(
    (g) => g.items.length > 0,
  );
}

type Res = { data?: { Items?: BaseItem[] | null }; error?: unknown };
const unwrap = (r: Res, what: string) => {
  if (r.error !== undefined) throw new Error(`${what} search failed`);
  return r.data?.Items ?? [];
};

/**
 * The searches, run in parallel, as jellyfin-web `useSearchItems`: items,
 * channels, people, studios and artists. Each part shows when it answers.
 */
export const SEARCH_PARTS: { key: string; run: (api: Api, userId: string, term: string) => Promise<BaseItem[]> }[] = [
  { key: 'items', run: async (api, userId, term) => unwrap(await api.GET('/Items', { params: { query: searchQuery(userId, term) } }), 'Items') },
  {
    key: 'channels',
    run: async (api, userId, term) =>
      unwrap(
        await api.GET('/Items', {
          params: { query: { userId, searchTerm: term, recursive: true, includeItemTypes: ['TvChannel'], limit: ROW_LIMIT, ...CARD } },
        }),
        'Channels',
      ),
  },
  {
    key: 'people',
    run: async (api, userId, term) =>
      unwrap(
        await api.GET('/Persons', {
          params: { query: { userId, searchTerm: term, limit: ROW_LIMIT, excludePersonTypes: ['Artist', 'AlbumArtist'], ...CARD } },
        }),
        'People',
      ),
  },
  {
    key: 'studios',
    run: async (api, userId, term) =>
      unwrap(await api.GET('/Studios', { params: { query: { userId, searchTerm: term, limit: ROW_LIMIT, ...CARD } } }), 'Studios'),
  },
  {
    key: 'artists',
    run: async (api, userId, term) =>
      unwrap(await api.GET('/Artists', { params: { query: { userId, searchTerm: term, limit: ROW_LIMIT, ...CARD } } }), 'Artists'),
  },
];

/** Suggestions when the search is empty: favorites first, then random movies, shows and artists. */
export async function fetchSearchSuggestions(api: Api, userId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Items', {
    params: {
      query: {
        userId,
        sortBy: ['IsFavoriteOrLiked', 'Random'],
        includeItemTypes: ['Movie', 'Series', 'MusicArtist'],
        limit: 20,
        recursive: true,
        imageTypeLimit: 0,
        enableImages: false,
        enableTotalRecordCount: false,
      },
    },
  });
  if (error !== undefined) throw new Error('Suggestions failed');
  return data?.Items ?? [];
}
