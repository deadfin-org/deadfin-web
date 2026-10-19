import { describe, expect, it } from 'vitest';
import { countLabel, itemsQuery, NO_FILTERS, type BaseItem, type ListQuery } from '../src/api/library';
import { SORTS } from '../src/api/sorts';
import { DEFAULT_SECTIONS, groupByDay, homeSections } from '../src/api/sections';
import { readListState, writeListState } from '../src/pages/library/listState';
import { LIBRARY_TYPES, libraryType, pickTab } from '../src/pages/library/views';
import { itemUrl, libraryUrl, listUrl } from '../src/routes/paths';

const base: ListQuery = {
  userId: 'u',
  parentId: 'v',
  itemTypes: ['Movie'],
  recursive: true,
  sortBy: ['SortName'],
  descending: false,
  filters: NO_FILTERS,
  startIndex: 0,
  limit: 36,
};

describe('itemsQuery', () => {
  it('lists movies by name, one page, with the total and only the Primary image', () => {
    const q = itemsQuery(base);
    expect(q).toMatchObject({
      parentId: 'v',
      recursive: true,
      includeItemTypes: ['Movie'],
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
      startIndex: 0,
      limit: 36,
      enableTotalRecordCount: true,
      enableImageTypes: ['Primary'],
      imageTypeLimit: 1,
    });
    expect(q.filters).toBeUndefined();
    expect(q.genres).toBeUndefined();
  });

  it('lists direct children for a folder view (the Live TV fast path)', () => {
    const q = itemsQuery({ ...base, itemTypes: undefined, recursive: false });
    expect(q.recursive).toBe(false);
    expect(q.includeItemTypes).toBeUndefined();
    expect(q.sortBy).toEqual(['SortName']);
  });

  it('breaks sort ties by name so pages do not overlap', () => {
    const q = itemsQuery({ ...base, sortBy: ['DateCreated'], descending: true, startIndex: 36 });
    expect(q.sortBy).toEqual(['DateCreated', 'SortName']);
    expect(q.sortOrder).toEqual(['Descending']);
    expect(q.startIndex).toBe(36);
  });

  it('maps every filter to its server parameter', () => {
    const q = itemsQuery({
      ...base,
      letter: 'B',
      filters: {
        status: ['IsPlayed', 'IsFavorite'],
        features: ['HasSubtitles'],
        video: ['IsHD', 'Is4K'],
        videoTypes: ['BluRay'],
        seriesStatus: ['Ended'],
        genres: ['Action, Adventure'],
        ratings: ['PG'],
        tags: ['US / Entertainment'],
        years: [1999],
      },
    });
    expect(q).toMatchObject({
      filters: ['IsPlayed'],
      isFavorite: true,
      hasSubtitles: true,
      isHd: true,
      is4K: true,
      videoTypes: ['BluRay'],
      seriesStatus: ['Ended'],
      genres: ['Action, Adventure'],
      officialRatings: ['PG'],
      tags: ['US / Entertainment'],
      years: [1999],
      nameStartsWith: 'B',
    });
    expect(itemsQuery({ ...base, letter: '#' })).toMatchObject({ nameLessThan: 'A' });
    expect(itemsQuery({ ...base, filters: { ...NO_FILTERS, video: ['IsHD', 'IsSD'] } }).isHd).toBe(false);
  });
});

describe('list state in the URL', () => {
  it('round-trips sort, order, letter and filters', () => {
    const s = {
      sortBy: SORTS.movies[4]!.by,
      descending: true,
      letter: 'C',
      filters: { ...NO_FILTERS, status: ['IsUnplayed' as const], genres: ['Action, Adventure', 'Drama'], years: [2001, 1999] },
    };
    const p = writeListState(new URLSearchParams('tab=0&topParentId=v'), s, 'movies');
    expect(p.get('topParentId')).toBe('v');
    expect(p.get('genres')).toBe('Action, Adventure|Drama');
    expect(readListState(p, 'movies')).toEqual(s);
  });

  it('keeps the default sort out of the URL', () => {
    const p = writeListState(new URLSearchParams(), readListState(new URLSearchParams(), 'episodes'), 'episodes');
    expect(p.toString()).toBe('');
    expect(readListState(p, 'episodes').sortBy).toEqual(['SeriesSortName']);
  });
});

describe('library tabs', () => {
  it('match jellyfin-web 12.0 order for movies and shows', () => {
    expect(libraryType('/movies')!.tabs.map((t) => t.label)).toEqual([
      'Movies',
      'Suggestions',
      'Favorites',
      'Collections',
      'Genres',
      'Studios',
      'Playlists',
    ]);
    expect(libraryType('/tv')!.tabs.map((t) => t.label)).toEqual([
      'Shows',
      'Suggestions',
      'Upcoming',
      'Genres',
      'TV Networks',
      'Episodes',
      'Collections',
      'Playlists',
    ]);
    expect(libraryType('/boxsets')!.tabs.map((t) => t.label)).toEqual(['Collections', 'Favorites', 'Genres']);
    expect(libraryType('/playlists')!.tabs.map((t) => t.label)).toEqual(['Playlists', 'Favorites']);
  });

  it('keep jellyfin-web tab numbers, with gaps for tabs Deadfin has not yet', () => {
    for (const t of LIBRARY_TYPES) {
      const idx = t.tabs.map((x) => x.index);
      expect([...idx].sort((a, b) => a - b), t.path).toEqual(idx);
    }
    const live = libraryType('/livetv')!;
    expect(pickTab(live, '2').label).toBe('Channels');
    expect(pickTab(live, null).label).toBe('Channels');
    expect(pickTab(libraryType('/tv')!, '5').label).toBe('Episodes');
    expect(pickTab(libraryType('/tv')!, '99').label).toBe('Shows');
  });

  it('every sorted tab names a sort menu that exists', () => {
    for (const t of LIBRARY_TYPES) for (const tab of t.tabs) if (tab.sorts) expect(SORTS[tab.sorts]).toBeDefined();
  });
});

describe('library links', () => {
  it('use jellyfin-web paths', () => {
    expect(libraryUrl({ Id: 'm1', CollectionType: 'movies' })).toBe('/movies?topParentId=m1&collectionType=movies');
    expect(libraryUrl({ Id: 't1', CollectionType: 'tvshows' }, { tab: 1 })).toBe('/tv?topParentId=t1&collectionType=tvshows&tab=1');
    expect(libraryUrl({ Id: 'x', CollectionType: null })).toBe('/mixed?topParentId=x&collectionType=mixed');
    expect(libraryUrl({ Id: 'f', CollectionType: 'folders' })).toBe('/list?parentId=f');
    expect(libraryUrl('old')).toBe('/library/old');
    expect(listUrl({ genreId: 'g', parentId: null, type: 'Movie' })).toBe('/list?genreId=g&type=Movie');
  });

  it('send each item type where jellyfin-web does', () => {
    expect(itemUrl({ Id: 'v', Type: 'CollectionFolder', CollectionType: 'movies' })).toBe('/movies?topParentId=v&collectionType=movies');
    expect(itemUrl({ Id: 'g', Type: 'Genre' }, { parentId: 'v' })).toBe('/list?genreId=g&parentId=v');
    expect(itemUrl({ Id: 's', Type: 'Studio' })).toBe('/list?studioId=s');
    expect(itemUrl({ Id: 'f', Type: 'Folder', IsFolder: true })).toBe('/list?parentId=f');
    expect(itemUrl({ Id: 'b', Type: 'BoxSet', IsFolder: true })).toBe('/details?id=b');
    expect(itemUrl({ Id: 'sr', Type: 'Series', IsFolder: true })).toBe('/details?id=sr');
    expect(itemUrl({ Id: 'm', Type: 'Movie' })).toBe('/details?id=m');
  });
});

describe('home sections', () => {
  it('use the server default order without preferences', () => {
    expect(homeSections(null)).toEqual(DEFAULT_SECTIONS);
  });

  it('read homesection0–9, with the default for empty slots', () => {
    const s = homeSections({ homesection0: 'latestmedia', homesection1: 'NextUp', homesection2: 'folders', homesection3: 'bogus' });
    expect(s.slice(0, 5)).toEqual(['latestmedia', 'nextup', 'smalllibrarytiles', 'none', 'livetv']);
  });
});

describe('groupByDay', () => {
  it('groups upcoming episodes by air date', () => {
    const now = new Date(2026, 9, 19, 12);
    const at = (d: number) => new Date(2026, 9, d, 20).toISOString();
    const groups = groupByDay(
      [
        { Id: 'a', PremiereDate: at(19) },
        { Id: 'b', PremiereDate: at(20) },
        { Id: 'c', PremiereDate: at(20) },
        { Id: 'd' },
      ] as BaseItem[],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 1],
      ['Tomorrow', 2],
      ['Unknown', 1],
    ]);
  });
});

describe('countLabel', () => {
  it('says item or items', () => {
    expect(countLabel(1)).toBe('1 item');
    expect(countLabel(40)).toBe('40 items');
  });
});
