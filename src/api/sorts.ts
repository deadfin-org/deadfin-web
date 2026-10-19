import type { ItemSortBy } from './library';

export interface SortOption {
  label: string;
  by: ItemSortBy[];
}

const NAME: SortOption = { label: 'Name', by: ['SortName'] };
const RANDOM: SortOption = { label: 'Random', by: ['Random'] };
const COMMUNITY: SortOption = { label: 'Community Rating', by: ['CommunityRating', 'SortName'] };
const CRITIC: SortOption = { label: 'Critics Rating', by: ['CriticRating', 'SortName'] };
const ADDED: SortOption = { label: 'Date Added', by: ['DateCreated', 'SortName'] };
const PLAYED: SortOption = { label: 'Date Played', by: ['DatePlayed', 'SortName'] };
const RATING: SortOption = { label: 'Parental Rating', by: ['OfficialRating', 'SortName'] };
const PLAY_COUNT: SortOption = { label: 'Play Count', by: ['PlayCount', 'SortName'] };
const RELEASE: SortOption = { label: 'Release Date', by: ['ProductionYear', 'PremiereDate', 'SortName'] };
const RUNTIME: SortOption = { label: 'Runtime', by: ['Runtime', 'SortName'] };

/** Sort menus per tab, as jellyfin-web 12.0 `SortButton` (same labels, same keys, same order). */
export const SORTS = {
  movies: [NAME, RANDOM, COMMUNITY, CRITIC, ADDED, PLAYED, RATING, PLAY_COUNT, RELEASE, RUNTIME],
  collections: [NAME, RANDOM, COMMUNITY, ADDED, RATING, RELEASE],
  series: [
    NAME,
    RANDOM,
    COMMUNITY,
    { label: 'Date Show Added', by: ['DateCreated', 'SortName'] },
    { label: 'Date Episode Added', by: ['DateLastContentAdded', 'SortName'] },
    { label: 'Date Played', by: ['SeriesDatePlayed', 'SortName'] },
    RATING,
    RELEASE,
  ],
  episodes: [
    { label: 'Name', by: ['SeriesSortName'] },
    RANDOM,
    COMMUNITY,
    ADDED,
    RELEASE,
    PLAYED,
    RATING,
    PLAY_COUNT,
    RUNTIME,
  ],
  albums: [
    NAME,
    RANDOM,
    { label: 'Album Artist', by: ['AlbumArtist', 'SortName'] },
    COMMUNITY,
    CRITIC,
    RELEASE,
    ADDED,
  ],
  songs: [
    { label: 'Track Name', by: ['Name'] },
    RANDOM,
    { label: 'Album', by: ['Album', 'AlbumArtist', 'SortName'] },
    { label: 'Album Artist', by: ['AlbumArtist', 'Album', 'SortName'] },
    { label: 'Artist', by: ['Artist', 'Album', 'SortName'] },
    ADDED,
    PLAYED,
    PLAY_COUNT,
    { label: 'Release Date', by: ['ProductionYear', 'PremiereDate', 'AlbumArtist', 'Album', 'SortName'] },
    { label: 'Runtime', by: ['Runtime', 'AlbumArtist', 'Album', 'SortName'] },
  ],
  playlists: [NAME, RANDOM, ADDED, { label: 'Date Playlist Updated', by: ['DateLastContentAdded', 'SortName'] }, RELEASE, RUNTIME],
  photos: [NAME, RANDOM, ADDED],
  videos: [NAME, RANDOM, COMMUNITY, ADDED, PLAYED, RATING, PLAY_COUNT, RELEASE, RUNTIME],
  books: [NAME, RANDOM, RELEASE, ADDED, PLAYED, { label: 'Index Number', by: ['IndexNumber', 'SortName'] }],
  folders: [NAME, RANDOM, COMMUNITY, ADDED, PLAYED, { label: 'Folders', by: ['IsFolder', 'SortName'] }, RATING, PLAY_COUNT, RELEASE, RUNTIME],
  mixed: [
    NAME,
    RANDOM,
    COMMUNITY,
    CRITIC,
    ADDED,
    { label: 'Date Episode Added', by: ['DateLastContentAdded', 'SortName'] },
    PLAYED,
    RATING,
    PLAY_COUNT,
    RELEASE,
    RUNTIME,
  ],
} satisfies Record<string, SortOption[]>;

export type SortSet = keyof typeof SORTS;
