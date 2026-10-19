import { useSearchParams } from 'react-router-dom';
import { NO_FILTERS, type ItemSortBy, type ListFilters } from '../../api/library';
import { SORTS, type SortSet } from '../../api/sorts';

/** Sort, filters and letter of a streamed list, kept in the URL so Back and links keep them. */
export interface ListState {
  sortBy: ItemSortBy[];
  descending: boolean;
  filters: ListFilters;
  letter: string | null;
}

/** URL keys that belong to list state; a tab change clears them. */
export const LIST_KEYS = ['sortBy', 'sortOrder', 'filters', 'features', 'video', 'videoTypes', 'seriesStatus', 'genres', 'ratings', 'tags', 'years', 'letter'];

// Names can hold commas ("Action, Adventure"), so value lists use "|" as the server does.
const split = (v: string | null, sep = '|') => (v ? v.split(sep).filter(Boolean) : []);

export function readListState(params: URLSearchParams, sorts: SortSet): ListState {
  const sortBy = split(params.get('sortBy'), ',') as ItemSortBy[];
  return {
    sortBy: sortBy.length ? sortBy : SORTS[sorts][0]!.by,
    descending: params.get('sortOrder') === 'Descending',
    letter: params.get('letter'),
    filters: {
      status: split(params.get('filters'), ',') as ListFilters['status'],
      features: split(params.get('features'), ',') as ListFilters['features'],
      video: split(params.get('video'), ',') as ListFilters['video'],
      videoTypes: split(params.get('videoTypes'), ',') as ListFilters['videoTypes'],
      seriesStatus: split(params.get('seriesStatus'), ',') as ListFilters['seriesStatus'],
      genres: split(params.get('genres')),
      ratings: split(params.get('ratings')),
      tags: split(params.get('tags')),
      years: split(params.get('years'), ',').map(Number).filter(Number.isFinite),
    },
  };
}

export function writeListState(params: URLSearchParams, s: ListState, sorts: SortSet): URLSearchParams {
  const next = new URLSearchParams(params);
  const put = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
  const isDefault = s.sortBy.join(',') === SORTS[sorts][0]!.by.join(',');
  put('sortBy', isDefault ? '' : s.sortBy.join(','));
  put('sortOrder', s.descending ? 'Descending' : '');
  put('letter', s.letter ?? '');
  const f = s.filters;
  put('filters', f.status.join(','));
  put('features', f.features.join(','));
  put('video', f.video.join(','));
  put('videoTypes', f.videoTypes.join(','));
  put('seriesStatus', f.seriesStatus.join(','));
  put('genres', f.genres.join('|'));
  put('ratings', f.ratings.join('|'));
  put('tags', f.tags.join('|'));
  put('years', f.years.join(','));
  return next;
}

export function useListState(sorts: SortSet): [ListState, (s: ListState) => void] {
  const [params, setParams] = useSearchParams();
  const state = readListState(params, sorts);
  const set = (s: ListState) => setParams((p) => writeListState(p, s, sorts), { replace: true });
  return [state, set];
}

export const DEFAULT_STATE = (sorts: SortSet): ListState => ({
  sortBy: SORTS[sorts][0]!.by,
  descending: false,
  filters: NO_FILTERS,
  letter: null,
});
