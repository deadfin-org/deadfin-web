import type { ItemKind, ListSource } from '../../api/library';
import type { SortSet } from '../../api/sorts';

/** A suggestions row on the Suggestions tab. */
export type SuggestionSection =
  | { kind: 'resume'; title: string; mediaType: 'Video' | 'Audio' | 'Book' }
  | { kind: 'latest'; title: string; itemTypes?: ItemKind[] }
  | { kind: 'nextUp'; title: string }
  | { kind: 'recommendations' }
  | { kind: 'played'; title: string; itemTypes: ItemKind[]; sortBy: 'DatePlayed' | 'PlayCount' };

export interface LibraryTab {
  /** The `?tab=` value, as jellyfin-web; a tab Deadfin does not have yet leaves a gap. */
  index: number;
  label: string;
  kind: 'items' | 'suggestions' | 'genres' | 'studios' | 'upcoming' | 'channels';
  /** For `items`: where the pages come from (default /Items). */
  source?: ListSource;
  itemTypes?: ItemKind[];
  /** Direct children only (Folders tabs, Live TV channels). */
  folders?: boolean;
  favorites?: boolean;
  sorts?: SortSet;
  /** Filter dialog groups; none means no Filter button. */
  filters?: FilterGroup[];
  alphabet?: boolean;
  empty?: string;
  sections?: SuggestionSection[];
}

export type FilterGroup = 'status' | 'favorite' | 'seriesStatus' | 'features' | 'video' | 'values' | 'tags';

export interface LibraryType {
  path: string;
  collectionType: string;
  tabs: LibraryTab[];
}

const NO_COLLECTIONS =
  "Collections allow you to enjoy personalized groupings of Movies, Series, and Albums. Click the '+' button to start creating collections.";
const MOVIE_FILTERS: FilterGroup[] = ['status', 'features', 'video', 'values'];
const BASIC_FILTERS: FilterGroup[] = ['status', 'values'];

const collections = (index: number, filters = BASIC_FILTERS): LibraryTab => ({
  index,
  label: 'Collections',
  kind: 'items',
  itemTypes: ['BoxSet'],
  sorts: 'collections',
  filters,
  alphabet: true,
  empty: NO_COLLECTIONS,
});

const playlists = (index: number): LibraryTab => ({
  index,
  label: 'Playlists',
  kind: 'items',
  itemTypes: ['Playlist'],
  sorts: 'playlists',
});

/** Tabs per library type, in jellyfin-web 12.0 order (`LibraryRoutes`, `constants/views`). */
export const LIBRARY_TYPES: LibraryType[] = [
  {
    path: '/movies',
    collectionType: 'movies',
    tabs: [
      { index: 0, label: 'Movies', kind: 'items', itemTypes: ['Movie'], sorts: 'movies', filters: MOVIE_FILTERS, alphabet: true },
      {
        index: 1,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'resume', title: 'Continue Watching', mediaType: 'Video' },
          { kind: 'latest', title: 'Recently Added Movies', itemTypes: ['Movie'] },
          { kind: 'recommendations' },
        ],
      },
      { index: 2, label: 'Favorites', kind: 'items', itemTypes: ['Movie'], favorites: true, sorts: 'movies', filters: MOVIE_FILTERS, alphabet: true },
      collections(3),
      { index: 4, label: 'Genres', kind: 'genres', itemTypes: ['Movie'] },
      { index: 5, label: 'Studios', kind: 'studios', itemTypes: ['Movie'] },
      playlists(6),
    ],
  },
  {
    path: '/tv',
    collectionType: 'tvshows',
    tabs: [
      {
        index: 0,
        label: 'Shows',
        kind: 'items',
        itemTypes: ['Series'],
        sorts: 'series',
        filters: ['status', 'seriesStatus', 'features', 'video', 'values'],
        alphabet: true,
      },
      {
        index: 1,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'resume', title: 'Continue Watching', mediaType: 'Video' },
          { kind: 'latest', title: 'Recently Added Episodes', itemTypes: ['Episode'] },
          { kind: 'nextUp', title: 'Next Up' },
        ],
      },
      { index: 2, label: 'Upcoming', kind: 'upcoming' },
      { index: 3, label: 'Genres', kind: 'genres', itemTypes: ['Series'] },
      { index: 4, label: 'TV Networks', kind: 'studios', itemTypes: ['Series'] },
      {
        index: 5,
        label: 'Episodes',
        kind: 'items',
        itemTypes: ['Episode'],
        sorts: 'episodes',
        filters: MOVIE_FILTERS,
        empty: 'No episodes are currently available.',
      },
      collections(6),
      playlists(7),
    ],
  },
  {
    path: '/music',
    collectionType: 'music',
    tabs: [
      { index: 0, label: 'Albums', kind: 'items', itemTypes: ['MusicAlbum'], sorts: 'albums', filters: BASIC_FILTERS, alphabet: true },
      {
        index: 1,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'latest', title: 'Recently Added Music', itemTypes: ['Audio'] },
          { kind: 'played', title: 'Recently Played', itemTypes: ['Audio'], sortBy: 'DatePlayed' },
          { kind: 'played', title: 'Frequently Played', itemTypes: ['Audio'], sortBy: 'PlayCount' },
        ],
      },
      { index: 2, label: 'Album artists', kind: 'items', source: 'albumArtists', sorts: 'albums', filters: ['favorite'], alphabet: true },
      { index: 3, label: 'Artists', kind: 'items', source: 'artists', sorts: 'albums', filters: ['favorite'], alphabet: true },
      playlists(4),
      { index: 5, label: 'Songs', kind: 'items', itemTypes: ['Audio'], sorts: 'songs', filters: BASIC_FILTERS, alphabet: true },
      { index: 6, label: 'Genres', kind: 'genres', itemTypes: ['MusicAlbum'] },
      collections(7),
    ],
  },
  {
    path: '/boxsets',
    collectionType: 'boxsets',
    tabs: [
      collections(0),
      { ...collections(1), label: 'Favorites', favorites: true, empty: undefined },
      { index: 2, label: 'Genres', kind: 'genres', itemTypes: ['BoxSet'] },
    ],
  },
  {
    path: '/playlists',
    collectionType: 'playlists',
    tabs: [
      { index: 0, label: 'Playlists', kind: 'items', itemTypes: ['Playlist'], sorts: 'playlists', filters: BASIC_FILTERS, alphabet: true },
      { index: 1, label: 'Favorites', kind: 'items', itemTypes: ['Playlist'], favorites: true, sorts: 'playlists', alphabet: true },
    ],
  },
  {
    // Programs, Guide, Recordings, Schedule and Series come with Live TV viewing (deadfin-web#91).
    path: '/livetv',
    collectionType: 'livetv',
    tabs: [{ index: 2, label: 'Channels', kind: 'channels', folders: true, filters: ['favorite', 'tags'] }],
  },
  {
    path: '/homevideos',
    collectionType: 'homevideos',
    tabs: [
      { index: 0, label: 'Folders', kind: 'items', folders: true, itemTypes: ['Folder', 'Photo', 'PhotoAlbum', 'Video'], sorts: 'folders', filters: BASIC_FILTERS, alphabet: true },
      { index: 1, label: 'Photos', kind: 'items', itemTypes: ['Photo'], sorts: 'photos', filters: BASIC_FILTERS, alphabet: true },
      { index: 2, label: 'Photo Albums', kind: 'items', itemTypes: ['PhotoAlbum'], sorts: 'photos', filters: BASIC_FILTERS, alphabet: true },
      { index: 3, label: 'Videos', kind: 'items', itemTypes: ['Video'], sorts: 'videos', filters: BASIC_FILTERS, alphabet: true },
    ],
  },
  {
    path: '/musicvideos',
    collectionType: 'musicvideos',
    tabs: [
      { index: 0, label: 'Folders', kind: 'items', folders: true, itemTypes: ['Folder', 'MusicVideo'], sorts: 'folders', filters: BASIC_FILTERS, alphabet: true },
      {
        index: 1,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'resume', title: 'Continue Watching', mediaType: 'Video' },
          { kind: 'latest', title: 'Recently Added', itemTypes: ['MusicVideo'] },
        ],
      },
      { index: 2, label: 'Videos', kind: 'items', itemTypes: ['MusicVideo'], sorts: 'videos', filters: BASIC_FILTERS, alphabet: true },
      playlists(3),
    ],
  },
  {
    path: '/books',
    collectionType: 'books',
    tabs: [
      { index: 0, label: 'Folders', kind: 'items', folders: true, itemTypes: ['Folder', 'AudioBook', 'Book'], sorts: 'folders', filters: BASIC_FILTERS, alphabet: true },
      { index: 1, label: 'Books', kind: 'items', itemTypes: ['AudioBook', 'Book'], sorts: 'books', filters: BASIC_FILTERS, alphabet: true },
      {
        index: 3,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'latest', title: 'Recently Added' },
          { kind: 'resume', title: 'Continue Reading', mediaType: 'Book' },
        ],
      },
      { index: 4, label: 'Genres', kind: 'genres', itemTypes: ['AudioBook', 'Book'] },
      collections(5),
      { index: 6, label: 'Favorites', kind: 'items', itemTypes: ['AudioBook', 'Book'], favorites: true, sorts: 'books', alphabet: true },
    ],
  },
  {
    path: '/mixed',
    collectionType: 'mixed',
    tabs: [
      { index: 0, label: 'Folders', kind: 'items', folders: true, itemTypes: ['Folder', 'Movie', 'Series'], sorts: 'folders', filters: BASIC_FILTERS, alphabet: true },
      {
        index: 1,
        label: 'Suggestions',
        kind: 'suggestions',
        sections: [
          { kind: 'resume', title: 'Continue Watching', mediaType: 'Video' },
          { kind: 'latest', title: 'Recently Added' },
          { kind: 'nextUp', title: 'Next Up' },
        ],
      },
      { index: 2, label: 'Media', kind: 'items', itemTypes: ['Movie', 'Series'], sorts: 'mixed', filters: BASIC_FILTERS, alphabet: true },
      collections(3),
      playlists(4),
    ],
  },
];

export function libraryType(path: string): LibraryType | undefined {
  return LIBRARY_TYPES.find((t) => t.path === path);
}

/** The tab for `?tab=`; an unknown or missing value gives the first tab. */
export function pickTab(type: LibraryType, raw: string | null): LibraryTab {
  const n = Number(raw ?? NaN);
  return type.tabs.find((t) => t.index === n) ?? type.tabs[0]!;
}
