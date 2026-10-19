import { describe, expect, it } from 'vitest';
import {
  canMarkPlayed,
  deleteConfirmation,
  detailsGroup,
  endsAt,
  isPlayable,
  itemCommands,
  primaryMediaInfo,
  refreshQuery,
  splitPeople,
} from '../src/api/items';
import type { BaseItem } from '../src/api/library';
import { groupCollection } from '../src/pages/details/children';
import { trackChoice } from '../src/pages/details/TrackSelections';
import { trackChoiceFrom, videoUrl } from '../src/routes/paths';

const item = (o: object) => o as BaseItem;
const MIN = 60 * 10_000_000;

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
  ])('%o → %s', (it_, expected) => {
    expect(isPlayable(it_)).toBe(expected);
  });
});

describe('primaryMediaInfo', () => {
  const now = new Date(2026, 9, 19, 20, 0);
  it('movie: year, runtime, rating, community and critic rating, Ends at', () => {
    const info = primaryMediaInfo(
      item({
        Type: 'Movie',
        MediaType: 'Video',
        ProductionYear: 2021,
        RunTimeTicks: 95 * MIN,
        OfficialRating: 'PG-13',
        CommunityRating: 7.26,
        CriticRating: 91,
      }),
      now,
    );
    expect(info.map((i) => i.key)).toEqual(['year', 'runtime', 'rating', 'community', 'critic-fresh', 'ends']);
    expect(info.map((i) => i.text).slice(0, 4)).toEqual(['2021', '1h 35m', 'PG-13', '★ 7.3']);
    expect(info[5]!.text).toMatch(/^Ends at /);
  });
  it('series: its run, no runtime, no Ends at', () => {
    expect(primaryMediaInfo(item({ Type: 'Series', IsFolder: true, ProductionYear: 2019, Status: 'Continuing', RunTimeTicks: MIN }))[0]!.text).toBe(
      '2019 - Present',
    );
    const ended = primaryMediaInfo(item({ Type: 'Series', IsFolder: true, ProductionYear: 2019, Status: 'Ended', EndDate: '2022-05-01T00:00:00Z' }));
    expect(ended.map((i) => i.text)).toEqual(['2019 - 2022']);
  });
  it('episode: no official rating', () => {
    expect(primaryMediaInfo(item({ Type: 'Episode', OfficialRating: 'TV-MA' })).find((i) => i.key === 'rating')).toBeUndefined();
  });
  it('rotten below 60', () => {
    expect(primaryMediaInfo(item({ Type: 'Movie', CriticRating: 40 })).map((i) => i.key)).toContain('critic-rotten');
  });
});

describe('endsAt', () => {
  it('counts what is left to watch', () => {
    const now = new Date(2026, 0, 1, 20, 0);
    const at = endsAt(item({ MediaType: 'Video', RunTimeTicks: 60 * MIN, UserData: { PlaybackPositionTicks: 30 * MIN } }), now);
    expect(at).toBe(`Ends at ${new Date(2026, 0, 1, 20, 30).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  });
  it('nothing for audio, live or a finished position', () => {
    expect(endsAt(item({ MediaType: 'Audio', RunTimeTicks: MIN }))).toBe('');
    expect(endsAt(item({ MediaType: 'Video', RunTimeTicks: MIN, StartDate: '2026-01-01' }))).toBe('');
    expect(endsAt(item({ MediaType: 'Video', RunTimeTicks: MIN, UserData: { PlaybackPositionTicks: MIN } }))).toBe('');
  });
});

describe('splitPeople', () => {
  it('merges a director who also writes, splits guest stars, drops artists', () => {
    const { cast, guests } = splitPeople([
      { Id: 'a', Name: 'Ada', Type: 'Director' },
      { Id: 'b', Name: 'Bo', Type: 'Actor', Role: 'Captain' },
      { Id: 'a', Name: 'Ada', Type: 'Writer' },
      { Id: 'c', Name: 'Cy', Type: 'GuestStar', Role: 'Diver' },
      { Id: 'd', Name: 'Di', Type: 'Artist' },
    ]);
    expect(cast.map((p) => [p.Name, p.roles])).toEqual([
      ['Ada', ['Director', 'Writer']],
      ['Bo', ['Captain']],
    ]);
    expect(guests.map((p) => p.Name)).toEqual(['Cy']);
  });
});

describe('detailsGroup', () => {
  it('lists directors, writers, studios, genres; plural labels for many', () => {
    const rows = detailsGroup(
      item({
        People: [
          { Id: '1', Name: 'Ada', Type: 'Director' },
          { Id: '2', Name: 'Bo', Type: 'Writer' },
          { Id: '3', Name: 'Cy', Type: 'Writer' },
        ],
        Studios: [{ Id: 's', Name: 'Abyssal' }],
        GenreItems: [],
      }),
    );
    expect(rows.map((r) => [r.label, r.links.map((l) => l.name)])).toEqual([
      ['Director', ['Ada']],
      ['Writers', ['Bo', 'Cy']],
      ['Studio', ['Abyssal']],
    ]);
    expect(rows[0]!.links[0]!.to).toBe('/details?id=1');
    expect(rows[2]!.links[0]!.to).toBe('/list?studioId=s');
  });
});

describe('itemCommands (jellyfin-web itemContextMenu conditions)', () => {
  const admin = { Policy: { IsAdministrator: true } } as never;
  const plain = { Policy: { IsAdministrator: false, EnableCollectionManagement: false } } as never;
  const movie = item({ Id: 'm', Type: 'Movie', MediaType: 'Video', CanDownload: true, CanDelete: true, MediaSources: [] });
  it('admin on a movie: all, in order', () => {
    expect(itemCommands(movie, admin).map((c) => c.name)).toEqual([
      'Add to collection',
      'Add to playlist',
      'Download',
      'Copy Stream URL',
      'Delete media',
      'Media Info',
      'Refresh metadata',
    ]);
  });
  it('a user without collection management, download or delete', () => {
    const m = item({ ...movie, CanDownload: false, CanDelete: false });
    expect(itemCommands(m, plain).map((c) => c.id)).toEqual(['addtoplaylist', 'moremediainfo']);
  });
  it('collection management policy allows Add to collection', () => {
    const u = { Policy: { IsAdministrator: false, EnableCollectionManagement: true } } as never;
    expect(itemCommands(item({ Id: 'm', Type: 'Movie', MediaType: 'Video' }), u).map((c) => c.id)).toContain('addtocollection');
  });
  it('delete labels by type; no collection entry for a person-less type such as Audio', () => {
    expect(itemCommands(item({ Type: 'Series', IsFolder: true, CanDelete: true }), admin).find((c) => c.id === 'delete')?.name).toBe(
      'Delete Series',
    );
    expect(itemCommands(item({ Type: 'Playlist', IsFolder: true, CanDelete: true }), admin).find((c) => c.id === 'delete')?.name).toBe('Delete');
    expect(itemCommands(item({ Type: 'Audio', MediaType: 'Audio' }), admin).map((c) => c.id)).not.toContain('addtocollection');
  });
  it('Live TV channels: no playlist, no refresh', () => {
    const ids = itemCommands(item({ Type: 'TvChannel', MediaType: 'Video' }), admin).map((c) => c.id);
    expect(ids).not.toContain('addtoplaylist');
    expect(ids).not.toContain('refresh');
  });
});

describe('refreshQuery and deleteConfirmation', () => {
  it('maps the refresh modes as jellyfin-web', () => {
    expect(refreshQuery('scan', true, true)).toEqual({
      metadataRefreshMode: 'Default',
      imageRefreshMode: 'Default',
      replaceAllMetadata: false,
      replaceAllImages: false,
      regenerateTrickplay: false,
    });
    expect(refreshQuery('all', true, false)).toMatchObject({ metadataRefreshMode: 'FullRefresh', replaceAllMetadata: true, replaceAllImages: true });
    expect(refreshQuery('missing', false, true)).toMatchObject({ replaceAllMetadata: false, regenerateTrickplay: true });
  });
  it('names the item, or counts a series', () => {
    expect(deleteConfirmation(item({ Type: 'Movie', Name: 'Hull' }))).toMatch(/^Deleting "Hull" will delete it/);
    expect(deleteConfirmation(item({ Type: 'Series', RecursiveItemCount: 12 }))).toMatch(/ALL 12 episodes/);
    expect(deleteConfirmation(item({ Type: 'Playlist' }))).toBe('Are you sure you wish to delete this playlist?');
  });
});

describe('canMarkPlayed', () => {
  it.each([
    [{ Type: 'Movie', MediaType: 'Video' }, true],
    [{ Type: 'Series' }, true],
    [{ Type: 'BoxSet' }, true],
    [{ Type: 'Person' }, false],
    [{ Type: 'Playlist' }, false],
    [{ Type: 'TvChannel', MediaType: 'Video' }, false],
  ])('%o → %s', (i, expected) => {
    expect(canMarkPlayed(item(i))).toBe(expected);
  });
});

describe('groupCollection', () => {
  it('groups by type in jellyfin-web order, the rest last', () => {
    const groups = groupCollection([
      item({ Id: '1', Type: 'Series' }),
      item({ Id: '2', Type: 'Movie', MediaType: 'Video' }),
      item({ Id: '3', Type: 'Photo' }),
      item({ Id: '4', Type: 'Video', MediaType: 'Video' }),
    ]);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.Id)])).toEqual([
      ['Movies', ['2']],
      ['Series', ['1']],
      ['Videos', ['4']],
      ['Other Items', ['3']],
    ]);
  });
});

describe('track choice → player URL', () => {
  const twin = item({
    Type: 'Movie',
    MediaType: 'Video',
    MediaSources: [
      {
        Id: 'src',
        DefaultAudioStreamIndex: 1,
        DefaultSubtitleStreamIndex: -1,
        MediaStreams: [
          { Type: 'Video', Index: 0 },
          { Type: 'Audio', Index: 1, Language: 'eng' },
          { Type: 'Audio', Index: 2, Language: 'fre' },
          { Type: 'Subtitle', Index: 3, IsTextSubtitleStream: true },
        ],
      },
    ],
  });
  it('the default tracks add nothing, so the play stays direct', () => {
    expect(trackChoice(twin, {})).toEqual({});
    expect(trackChoice(twin, { audio: 1, subtitle: null })).toEqual({});
  });
  it('a non-default audio or a subtitle goes into the URL and back out', () => {
    const choice = trackChoice(twin, { audio: 2, subtitle: 3 });
    expect(choice).toEqual({ audio: 2, subtitle: 3 });
    const url = videoUrl('m', 0, choice);
    expect(url).toBe('/video?id=m&audio=2&sub=3');
    expect(trackChoiceFrom(new URLSearchParams(url.split('?')[1]))).toEqual({ mediaSourceId: undefined, audio: 2, subtitle: 3 });
  });
  it('Off for a default subtitle is -1; the version goes along when there is a choice', () => {
    const two = item({ ...twin, MediaSources: [{ Id: 'a', DefaultSubtitleStreamIndex: 3 }, { Id: 'b' }] });
    expect(trackChoice(two, { sourceId: 'a', subtitle: null })).toEqual({ mediaSourceId: 'a', subtitle: -1 });
    expect(trackChoiceFrom(new URLSearchParams('id=x&source=a&sub=-1'))).toEqual({ mediaSourceId: 'a', audio: undefined, subtitle: null });
  });
});
