import { describe, expect, it } from 'vitest';
import { isPlayable } from '../src/pages/ItemDetail';

describe('isPlayable', () => {
  it.each([
    [{ Type: 'Movie', IsFolder: false, MediaType: 'Video' }, true],
    [{ Type: 'Episode', IsFolder: false, MediaType: 'Video' }, true],
    [{ Type: 'Audio', IsFolder: false, MediaType: 'Audio' }, true],
    [{ Type: 'Series', IsFolder: true, MediaType: 'Unknown' }, false],
    [{ Type: 'Season', IsFolder: true, MediaType: 'Unknown' }, false],
    [{ Type: 'MusicAlbum', IsFolder: true, MediaType: 'Unknown' }, false],
    [{ Type: 'BoxSet', IsFolder: true, MediaType: 'Unknown' }, false],
    [{ Type: 'Folder', IsFolder: true }, false],
    [{ Type: 'Photo', IsFolder: false, MediaType: 'Photo' }, false],
  ])('%o → %s', (item, expected) => {
    expect(isPlayable(item)).toBe(expected);
  });
});
