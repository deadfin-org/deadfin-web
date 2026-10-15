import type { Api } from './client';
import type { BaseItem } from './library';

type SearchKind = 'Movie' | 'Series' | 'Episode' | 'MusicAlbum' | 'Audio' | 'MusicVideo' | 'Video';

/** Result groups, in the order shown. */
export const SEARCH_GROUPS: { type: SearchKind; label: string }[] = [
  { type: 'Movie', label: 'Movies' },
  { type: 'Series', label: 'Shows' },
  { type: 'Episode', label: 'Episodes' },
  { type: 'MusicAlbum', label: 'Albums' },
  { type: 'Audio', label: 'Songs' },
  { type: 'MusicVideo', label: 'Music videos' },
  { type: 'Video', label: 'Videos' },
];

export const SEARCH_LIMIT = 60;

export function searchQuery(userId: string, term: string) {
  return {
    userId,
    searchTerm: term,
    recursive: true,
    includeItemTypes: SEARCH_GROUPS.map((g) => g.type),
    limit: SEARCH_LIMIT,
    enableUserData: true,
    imageTypeLimit: 1,
    enableImageTypes: ['Primary' as const],
  };
}

export interface SearchGroup {
  type: SearchKind;
  label: string;
  items: BaseItem[];
}

/** Splits results into SEARCH_GROUPS order, keeping the server's ranking within each; empty groups drop out. */
export function groupResults(items: BaseItem[]): SearchGroup[] {
  return SEARCH_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.Type === g.type) })).filter(
    (g) => g.items.length > 0,
  );
}

export async function fetchSearch(api: Api, userId: string, term: string): Promise<SearchGroup[]> {
  const { data, error } = await api.GET('/Items', { params: { query: searchQuery(userId, term) } });
  if (error !== undefined || !data) throw new Error('Search failed');
  return groupResults(data.Items ?? []);
}
