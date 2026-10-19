import { describe, expect, it } from 'vitest';
import type { BaseItem } from '../src/api/library';
import { groupResults, ITEM_SEARCH_TYPES, SEARCH_GROUPS, searchQuery } from '../src/api/search';

const item = (Id: string, Type: string) => ({ Id, Name: Id, Type }) as BaseItem;

describe('searchQuery', () => {
  it('searches every item kind across all libraries, without missing episodes', () => {
    const q = searchQuery('u1', 'trench');
    expect(q.searchTerm).toBe('trench');
    expect(q.recursive).toBe(true);
    expect(q.isMissing).toBe(false);
    expect(q.includeItemTypes).toEqual(ITEM_SEARCH_TYPES);
    expect(q.includeItemTypes).not.toContain('TvChannel');
  });

  it('has a group for every searched type', () => {
    const grouped = new Set(SEARCH_GROUPS.flatMap((g) => g.types));
    for (const t of ITEM_SEARCH_TYPES) expect(grouped).toContain(t);
  });
});

describe('groupResults', () => {
  it('groups in jellyfin-web order, keeps server ranking, drops empty groups', () => {
    const groups = groupResults([
      item('e1', 'Episode'),
      item('m1', 'Movie'),
      item('p1', 'Person'),
      item('s1', 'Series'),
      item('m2', 'Movie'),
      item('c1', 'TvChannel'),
      item('v1', 'MusicVideo'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Movies', 'Shows', 'Episodes', 'People', 'Videos', 'Channels']);
    expect(groups[0]!.items.map((i) => i.Id)).toEqual(['m1', 'm2']);
  });

  it('is empty for no results', () => {
    expect(groupResults([])).toEqual([]);
  });
});
