import type { Api } from './client';
import type { components } from './schema';

export type BaseItem = components['schemas']['BaseItemDto'];
type ItemKind = 'Movie' | 'Series' | 'MusicAlbum';

/** What a library lists for each kind; unknown kinds list direct children. */
export const LIBRARY_ITEM_TYPES: Record<string, ItemKind[]> = {
  movies: ['Movie'],
  tvshows: ['Series'],
  music: ['MusicAlbum'],
};

export type SortKey = 'SortName' | 'DateCreated' | 'PremiereDate';
export type PlayedFilter = 'all' | 'unplayed' | 'played';

export const SORT_LABELS: Record<SortKey, string> = {
  SortName: 'Name',
  DateCreated: 'Date added',
  PremiereDate: 'Release date',
};

export interface LibraryQuery {
  userId: string;
  viewId: string;
  collectionType?: string | null;
  sortBy: SortKey;
  descending: boolean;
  played: PlayedFilter;
  startIndex: number;
  limit: number;
}

/** Query parameters for one page of a library's items. */
export function libraryItemsQuery(q: LibraryQuery) {
  const itemTypes = q.collectionType ? LIBRARY_ITEM_TYPES[q.collectionType] : undefined;
  const filters: ('IsPlayed' | 'IsUnplayed')[] =
    q.played === 'played' ? ['IsPlayed'] : q.played === 'unplayed' ? ['IsUnplayed'] : [];
  return {
    userId: q.userId,
    parentId: q.viewId,
    recursive: itemTypes !== undefined,
    includeItemTypes: itemTypes,
    // Name breaks ties so paging is stable when the sort key repeats.
    sortBy: q.sortBy === 'SortName' ? ['SortName' as const] : [q.sortBy, 'SortName' as const],
    sortOrder: [q.descending ? ('Descending' as const) : ('Ascending' as const)],
    filters: filters.length ? filters : undefined,
    startIndex: q.startIndex,
    limit: q.limit,
    enableTotalRecordCount: true,
    enableUserData: true,
    imageTypeLimit: 1,
    enableImageTypes: ['Primary' as const],
  };
}

export async function fetchLibraryPage(api: Api, q: LibraryQuery) {
  const { data, error } = await api.GET('/Items', { params: { query: libraryItemsQuery(q) } });
  if (error !== undefined || !data) throw new Error(`Items failed for view ${q.viewId}`);
  return { items: data.Items ?? [], total: data.TotalRecordCount ?? 0, startIndex: q.startIndex };
}

/** The user's libraries (views), shared by the home page and library pages. */
export async function fetchUserViews(api: Api, userId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/UserViews', { params: { query: { userId } } });
  if (error !== undefined) throw new Error('UserViews failed');
  return data?.Items ?? [];
}

export function countLabel(n: number): string {
  return n === 1 ? '1 item' : `${n} items`;
}
