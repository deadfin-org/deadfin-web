import { describe, expect, it } from 'vitest';
import { countLabel, libraryItemsQuery, type LibraryQuery } from '../src/api/library';

const base: LibraryQuery = {
  userId: 'u',
  viewId: 'v',
  collectionType: 'movies',
  sortBy: 'SortName',
  descending: false,
  played: 'all',
  startIndex: 0,
  limit: 36,
};

describe('libraryItemsQuery', () => {
  it('lists movies recursively by name, with the total count', () => {
    const q = libraryItemsQuery(base);
    expect(q).toMatchObject({
      parentId: 'v',
      recursive: true,
      includeItemTypes: ['Movie'],
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
      startIndex: 0,
      limit: 36,
      enableTotalRecordCount: true,
    });
    expect(q.filters).toBeUndefined();
  });

  it('maps series and albums, and lists unknown kinds as direct children', () => {
    expect(libraryItemsQuery({ ...base, collectionType: 'tvshows' }).includeItemTypes).toEqual(['Series']);
    expect(libraryItemsQuery({ ...base, collectionType: 'music' }).includeItemTypes).toEqual(['MusicAlbum']);
    const mixed = libraryItemsQuery({ ...base, collectionType: null });
    expect(mixed.recursive).toBe(false);
    expect(mixed.includeItemTypes).toBeUndefined();
  });

  it('breaks sort ties by name so pages do not overlap', () => {
    const q = libraryItemsQuery({ ...base, sortBy: 'DateCreated', descending: true, startIndex: 36 });
    expect(q.sortBy).toEqual(['DateCreated', 'SortName']);
    expect(q.sortOrder).toEqual(['Descending']);
    expect(q.startIndex).toBe(36);
  });

  it('filters played and unplayed', () => {
    expect(libraryItemsQuery({ ...base, played: 'played' }).filters).toEqual(['IsPlayed']);
    expect(libraryItemsQuery({ ...base, played: 'unplayed' }).filters).toEqual(['IsUnplayed']);
  });
});

describe('countLabel', () => {
  it('says item or items', () => {
    expect(countLabel(1)).toBe('1 item');
    expect(countLabel(40)).toBe('40 items');
  });
});
