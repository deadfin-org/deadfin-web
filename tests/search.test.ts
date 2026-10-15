import { describe, expect, it } from 'vitest';
import type { BaseItem } from '../src/api/library';
import { groupResults, searchQuery, SEARCH_GROUPS } from '../src/api/search';

const item = (Id: string, Type: string) => ({ Id, Name: Id, Type }) as BaseItem;

describe('searchQuery', () => {
  it('searches every playable kind across all libraries', () => {
    const q = searchQuery('u1', 'trench');
    expect(q.searchTerm).toBe('trench');
    expect(q.recursive).toBe(true);
    expect(q.includeItemTypes).toEqual(SEARCH_GROUPS.map((g) => g.type));
  });
});

describe('groupResults', () => {
  it('groups in display order, keeps server ranking, drops empty groups', () => {
    const groups = groupResults([item('e1', 'Episode'), item('m1', 'Movie'), item('s1', 'Series'), item('m2', 'Movie')]);
    expect(groups.map((g) => g.label)).toEqual(['Movies', 'Shows', 'Episodes']);
    expect(groups[0]!.items.map((i) => i.Id)).toEqual(['m1', 'm2']);
  });

  it('is empty for no results', () => {
    expect(groupResults([])).toEqual([]);
  });
});
