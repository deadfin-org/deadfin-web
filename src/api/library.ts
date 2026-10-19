import type { Api } from './client';
import type { components } from './schema';

export type BaseItem = components['schemas']['BaseItemDto'];
export type ItemKind = components['schemas']['BaseItemKind'];
export type ItemSortBy = components['schemas']['ItemSortBy'];
export type StatusFilter = 'IsPlayed' | 'IsUnplayed' | 'IsFavorite' | 'IsResumable';
export type Feature = 'HasSubtitles' | 'HasTrailer' | 'HasSpecialFeature' | 'HasThemeSong' | 'HasThemeVideo';
export type VideoBasic = 'IsHD' | 'IsSD' | 'Is4K' | 'Is3D';
export type VideoType = components['schemas']['VideoType'];
export type SeriesStatus = components['schemas']['SeriesStatus'];

export interface ListFilters {
  status: StatusFilter[];
  features: Feature[];
  video: VideoBasic[];
  videoTypes: VideoType[];
  seriesStatus: SeriesStatus[];
  genres: string[];
  ratings: string[];
  tags: string[];
  years: number[];
}

export const NO_FILTERS: ListFilters = {
  status: [],
  features: [],
  video: [],
  videoTypes: [],
  seriesStatus: [],
  genres: [],
  ratings: [],
  tags: [],
  years: [],
};

export function activeFilterCount(f: ListFilters): number {
  return Object.values(f).reduce((n, v: unknown[]) => n + v.length, 0);
}

/** One page of any streamed list. */
export interface ListQuery {
  userId: string;
  parentId?: string | null;
  itemTypes?: ItemKind[];
  recursive: boolean;
  sortBy: ItemSortBy[];
  descending: boolean;
  filters: ListFilters;
  /** Alphabet picker: a letter, or '#' for names before A. */
  letter?: string | null;
  isFavorite?: boolean;
  genreIds?: string[];
  studioIds?: string[];
  isMissing?: boolean;
  startIndex: number;
  limit: number;
}

function letterQuery(letter?: string | null) {
  if (!letter) return {};
  return letter === '#' ? { nameLessThan: 'A' } : { nameStartsWith: letter };
}

const has = <T>(list: T[], v: T) => (list.includes(v) ? true : undefined);

/** Query parameters for one page of /Items. Only the Primary image: the card shows nothing else. */
export function itemsQuery(q: ListQuery) {
  const f = q.filters;
  const status = f.status.filter((s) => s !== 'IsFavorite');
  // HD and SD exclude each other on the server; SD wins as in jellyfin-web.
  const isHd = f.video.includes('IsSD') ? false : f.video.includes('IsHD') ? true : undefined;
  const list = <T>(v: T[]) => (v.length ? v : undefined);
  return {
    userId: q.userId,
    parentId: q.parentId || undefined,
    recursive: q.recursive,
    includeItemTypes: list(q.itemTypes ?? []),
    // A tie-breaker keeps paging stable when the sort key repeats.
    sortBy: q.sortBy.includes('SortName') || q.sortBy.includes('Random') ? q.sortBy : [...q.sortBy, 'SortName' as const],
    sortOrder: [q.descending ? ('Descending' as const) : ('Ascending' as const)],
    filters: list(status),
    isFavorite: q.isFavorite || f.status.includes('IsFavorite') || undefined,
    hasSubtitles: has(f.features, 'HasSubtitles'),
    hasTrailer: has(f.features, 'HasTrailer'),
    hasSpecialFeature: has(f.features, 'HasSpecialFeature'),
    hasThemeSong: has(f.features, 'HasThemeSong'),
    hasThemeVideo: has(f.features, 'HasThemeVideo'),
    isHd,
    is4K: has(f.video, 'Is4K'),
    is3D: has(f.video, 'Is3D'),
    videoTypes: list(f.videoTypes),
    seriesStatus: list(f.seriesStatus),
    genres: list(f.genres),
    officialRatings: list(f.ratings),
    tags: list(f.tags),
    years: list(f.years),
    genreIds: list(q.genreIds ?? []),
    studioIds: list(q.studioIds ?? []),
    isMissing: q.isMissing,
    ...letterQuery(q.letter),
    startIndex: q.startIndex,
    limit: q.limit,
    enableTotalRecordCount: true,
    enableUserData: true,
    imageTypeLimit: 1,
    enableImageTypes: ['Primary' as const],
  };
}

export interface Page {
  items: BaseItem[];
  total: number;
  startIndex: number;
}

/** Where a streamed list reads its pages. */
export type ListSource = 'items' | 'genres' | 'studios' | 'artists' | 'albumArtists' | 'nextUp';

function page(data: { Items?: BaseItem[] | null; TotalRecordCount?: number } | undefined, q: ListQuery): Page {
  const items = data?.Items ?? [];
  // Some endpoints return no total; a short page then ends the list.
  const total = data?.TotalRecordCount ?? (items.length < q.limit ? q.startIndex + items.length : Number.MAX_SAFE_INTEGER);
  return { items, total, startIndex: q.startIndex };
}

export async function fetchListPage(api: Api, source: ListSource, q: ListQuery): Promise<Page> {
  const common = {
    userId: q.userId,
    parentId: q.parentId || undefined,
    startIndex: q.startIndex,
    limit: q.limit,
    enableImageTypes: ['Primary' as const],
    imageTypeLimit: 1,
    enableTotalRecordCount: true,
    ...letterQuery(q.letter),
  };
  let res: { data?: { Items?: BaseItem[] | null; TotalRecordCount?: number }; error?: unknown };
  switch (source) {
    case 'items':
      res = await api.GET('/Items', { params: { query: itemsQuery(q) } });
      break;
    case 'genres':
      res = await api.GET('/Genres', {
        params: { query: { ...common, includeItemTypes: q.itemTypes, sortBy: ['SortName'], sortOrder: ['Ascending'] } },
      });
      break;
    case 'studios':
      res = await api.GET('/Studios', { params: { query: { ...common, includeItemTypes: q.itemTypes } } });
      break;
    case 'artists':
    case 'albumArtists':
      res = await api.GET(source === 'artists' ? '/Artists' : '/Artists/AlbumArtists', {
        params: {
          query: {
            ...common,
            sortBy: q.sortBy,
            sortOrder: [q.descending ? 'Descending' : 'Ascending'],
            isFavorite: q.isFavorite || q.filters.status.includes('IsFavorite') || undefined,
            enableUserData: true,
          },
        },
      });
      break;
    case 'nextUp':
      res = await api.GET('/Shows/NextUp', {
        params: { query: { ...common, enableUserData: true, enableTotalRecordCount: true } },
      });
      break;
  }
  if (res.error !== undefined || !res.data) throw new Error(`${source} failed`);
  return page(res.data, q);
}

/** Genres, years, ratings and tags present in a library, for the filter dialog. */
export async function fetchFilterValues(api: Api, userId: string, parentId: string | null | undefined, itemTypes?: ItemKind[]) {
  const { data, error } = await api.GET('/Items/Filters', {
    params: { query: { userId, parentId: parentId || undefined, includeItemTypes: itemTypes?.length ? itemTypes : undefined } },
  });
  if (error !== undefined) throw new Error('Filters failed');
  return {
    genres: data?.Genres ?? [],
    ratings: data?.OfficialRatings ?? [],
    tags: data?.Tags ?? [],
    years: [...(data?.Years ?? [])].sort((a, b) => b - a),
  };
}

/** The user's libraries (views), shared by the home page and library pages. */
export async function fetchUserViews(api: Api, userId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/UserViews', { params: { query: { userId } } });
  if (error !== undefined) throw new Error('UserViews failed');
  return data?.Items ?? [];
}

/** One item by id (a library, folder, genre or studio), for page titles. */
export async function fetchItem(api: Api, userId: string, itemId: string): Promise<BaseItem> {
  const { data, error } = await api.GET('/Items/{itemId}', { params: { path: { itemId }, query: { userId } } });
  if (error !== undefined || !data) throw new Error(`Item ${itemId} failed`);
  return data;
}

export function countLabel(n: number): string {
  return n === 1 ? '1 item' : `${n} items`;
}
