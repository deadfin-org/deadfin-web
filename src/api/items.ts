import type { Api } from './client';
import type { BaseItem } from './library';
import type { components } from './schema';
import { mediaUrl } from './mediaUrl';
import { TICKS_PER_SECOND, formatRuntime } from '../lib/format';
import { detailsUrl, listUrl } from '../routes/paths';

type User = components['schemas']['UserDto'];

/** One page of a streamed list. */
export interface Page {
  items: BaseItem[];
  total: number;
  startIndex: number;
}

/** What a card shows: the primary image, its blurhash, user data. Nothing more. */
export const CARD = {
  enableUserData: true,
  imageTypeLimit: 1,
  enableImageTypes: ['Primary' as const],
};

/** Cards in a wide (16:9) row: episodes, special features. */
const THUMB_CARD = {
  enableUserData: true,
  imageTypeLimit: 1,
  enableImageTypes: ['Primary' as const, 'Thumb' as const],
};

export async function fetchItem(api: Api, userId: string, itemId: string): Promise<BaseItem> {
  const { data, error } = await api.GET('/Items/{itemId}', { params: { path: { itemId }, query: { userId } } });
  if (error !== undefined || !data) throw new Error(`Items/${itemId} failed`);
  return data;
}

/** "More Like This": jellyfin-web asks for 12. */
export async function fetchSimilar(api: Api, userId: string, itemId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Items/{itemId}/Similar', {
    params: { path: { itemId }, query: { userId, limit: 12 } },
  });
  if (error !== undefined) throw new Error('Similar failed');
  return data?.Items ?? [];
}

export async function fetchSpecialFeatures(api: Api, userId: string, itemId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Items/{itemId}/SpecialFeatures', {
    params: { path: { itemId }, query: { userId } },
  });
  if (error !== undefined) throw new Error('SpecialFeatures failed');
  return data ?? [];
}

export async function fetchLocalTrailers(api: Api, userId: string, itemId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Items/{itemId}/LocalTrailers', {
    params: { path: { itemId }, query: { userId } },
  });
  if (error !== undefined) throw new Error('LocalTrailers failed');
  return data ?? [];
}

function page(data: { Items?: BaseItem[] | null; TotalRecordCount?: number } | undefined, startIndex: number): Page {
  return { items: data?.Items ?? [], total: data?.TotalRecordCount ?? 0, startIndex };
}

/** A page of a season's episodes, with overviews for the episode list. */
export async function fetchSeasonEpisodesPage(
  api: Api,
  userId: string,
  seriesId: string,
  seasonId: string,
  startIndex: number,
  limit: number,
): Promise<Page> {
  const { data, error } = await api.GET('/Shows/{seriesId}/Episodes', {
    params: {
      path: { seriesId },
      query: { userId, seasonId, startIndex, limit, fields: ['Overview'], ...THUMB_CARD },
    },
  });
  if (error !== undefined) throw new Error('Episodes failed');
  return page(data, startIndex);
}

/** A page of a folder's children: a collection's items. */
export async function fetchChildrenPage(
  api: Api,
  userId: string,
  parentId: string,
  startIndex: number,
  limit: number,
): Promise<Page> {
  const { data, error } = await api.GET('/Items', {
    params: {
      query: {
        userId,
        parentId,
        // Release order, then name, keeps paging stable.
        sortBy: ['PremiereDate', 'ProductionYear', 'SortName'],
        startIndex,
        limit,
        enableTotalRecordCount: true,
        ...CARD,
      },
    },
  });
  if (error !== undefined) throw new Error('Items failed');
  return page(data, startIndex);
}

/** The sections of a person's page, in jellyfin-web's order (`itemsByName`). */
export const PERSON_SECTIONS: { type: 'Movie' | 'Series' | 'Episode' | 'Trailer' | 'MusicVideo'; name: string; sortBy: components['schemas']['ItemSortBy'][] }[] = [
  { type: 'Movie', name: 'Movies', sortBy: ['PremiereDate', 'ProductionYear', 'SortName'] },
  { type: 'Series', name: 'Shows', sortBy: ['SortName'] },
  { type: 'Episode', name: 'Episodes', sortBy: ['SortName'] },
  { type: 'Trailer', name: 'Trailers', sortBy: ['SortName'] },
  { type: 'MusicVideo', name: 'Music Videos', sortBy: ['SortName'] },
];

export async function fetchPersonItemsPage(
  api: Api,
  userId: string,
  personId: string,
  section: (typeof PERSON_SECTIONS)[number],
  startIndex: number,
  limit: number,
): Promise<Page> {
  const { data, error } = await api.GET('/Items', {
    params: {
      query: {
        userId,
        personIds: [personId],
        recursive: true,
        includeItemTypes: [section.type],
        sortBy: section.sortBy,
        sortOrder: section.type === 'Movie' ? ['Descending'] : ['Ascending'],
        startIndex,
        limit,
        enableTotalRecordCount: true,
        ...CARD,
      },
    },
  });
  if (error !== undefined) throw new Error('Items failed');
  return page(data, startIndex);
}

/** A page of a playlist, in its order; each item carries its PlaylistItemId. */
export async function fetchPlaylistPage(
  api: Api,
  userId: string,
  playlistId: string,
  startIndex: number,
  limit: number,
): Promise<Page> {
  const { data, error } = await api.GET('/Playlists/{playlistId}/Items', {
    params: { path: { playlistId }, query: { userId, startIndex, limit, ...THUMB_CARD } },
  });
  if (error !== undefined) throw new Error('Playlist items failed');
  return page(data, startIndex);
}

/** Whether the user can change a playlist; a 404 (no access) is false. */
export async function fetchCanEditPlaylist(api: Api, userId: string, playlistId: string): Promise<boolean> {
  const { data, error } = await api.GET('/Playlists/{playlistId}/Users/{userId}', {
    params: { path: { playlistId, userId } },
  });
  if (error !== undefined) return false;
  return data?.CanEdit ?? false;
}

export async function movePlaylistItem(api: Api, playlistId: string, playlistItemId: string, newIndex: number) {
  const { error } = await api.POST('/Playlists/{playlistId}/Items/{itemId}/Move/{newIndex}', {
    params: { path: { playlistId, itemId: playlistItemId, newIndex } },
  });
  if (error !== undefined) throw new Error('Move failed');
}

export async function removeFromPlaylist(api: Api, playlistId: string, playlistItemIds: string[]) {
  const { error } = await api.DELETE('/Playlists/{playlistId}/Items', {
    params: { path: { playlistId }, query: { entryIds: playlistItemIds } },
  });
  if (error !== undefined) throw new Error('Remove failed');
}

/** Name and id of every item of a type, for the Add to collection and Add to playlist pickers. */
async function fetchNamed(api: Api, userId: string, type: 'BoxSet' | 'Playlist'): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Items', {
    params: {
      query: { userId, includeItemTypes: [type], recursive: true, sortBy: ['SortName'], enableUserData: false, enableImages: false },
    },
  });
  if (error !== undefined) throw new Error('Items failed');
  return data?.Items ?? [];
}

export const fetchCollections = (api: Api, userId: string) => fetchNamed(api, userId, 'BoxSet');

/** The playlists this user can add to, as jellyfin-web's playlist editor: each checked for CanEdit. */
export async function fetchEditablePlaylists(api: Api, userId: string): Promise<BaseItem[]> {
  const all = await fetchNamed(api, userId, 'Playlist');
  const editable = await Promise.all(all.map((p) => (p.Id ? fetchCanEditPlaylist(api, userId, p.Id) : false)));
  return all.filter((_, i) => editable[i]);
}

export async function addToCollection(api: Api, collectionId: string, ids: string[]) {
  const { error } = await api.POST('/Collections/{collectionId}/Items', {
    params: { path: { collectionId }, query: { ids } },
  });
  if (error !== undefined) throw new Error('Add to collection failed');
}

export async function createCollection(api: Api, name: string, ids: string[]): Promise<string | undefined> {
  const { data, error } = await api.POST('/Collections', { params: { query: { name, ids, isLocked: false } } });
  if (error !== undefined) throw new Error('New collection failed');
  // Stock 12.0 can drop the items when this is the first collection (it
  // makes the Collections folder first). Adding again is safe: the server
  // skips items already in the collection.
  if (data?.Id && ids.length) await addToCollection(api, data.Id, ids);
  return data?.Id ?? undefined;
}

export async function addToPlaylist(api: Api, userId: string, playlistId: string, ids: string[]) {
  const { error } = await api.POST('/Playlists/{playlistId}/Items', {
    params: { path: { playlistId }, query: { ids, userId } },
  });
  if (error !== undefined) throw new Error('Add to playlist failed');
}

export async function createPlaylist(
  api: Api,
  userId: string,
  name: string,
  ids: string[],
  isPublic: boolean,
): Promise<string | undefined> {
  const { data, error } = await api.POST('/Playlists', {
    body: { Name: name, Ids: ids, UserId: userId, IsPublic: isPublic },
  });
  if (error !== undefined) throw new Error('New playlist failed');
  return data?.Id ?? undefined;
}

export type RefreshMode = 'scan' | 'missing' | 'all';

/** The query jellyfin-web's refresh dialog sends for each mode. */
export function refreshQuery(mode: RefreshMode, replaceImages: boolean, replaceTrickplay: boolean) {
  const full = mode !== 'scan';
  return {
    metadataRefreshMode: full ? ('FullRefresh' as const) : ('Default' as const),
    imageRefreshMode: full ? ('FullRefresh' as const) : ('Default' as const),
    replaceAllMetadata: mode === 'all',
    replaceAllImages: full && replaceImages,
    regenerateTrickplay: full && replaceTrickplay,
  };
}

export async function refreshItem(api: Api, itemId: string, mode: RefreshMode, replaceImages: boolean, replaceTrickplay: boolean) {
  const { error } = await api.POST('/Items/{itemId}/Refresh', {
    params: { path: { itemId }, query: refreshQuery(mode, replaceImages, replaceTrickplay) },
  });
  if (error !== undefined) throw new Error('Refresh failed');
}

export async function deleteItem(api: Api, itemId: string) {
  const { error } = await api.DELETE('/Items/{itemId}', { params: { path: { itemId } } });
  if (error !== undefined) throw new Error('Delete failed');
}

/** The file itself; the link carries the token, as jellyfin-web `getDownloadUrl`. */
export function downloadUrl(serverUrl: string, itemId: string, token: string): string {
  return mediaUrl(serverUrl, `/Items/${encodeURIComponent(itemId)}/Download`, token);
}

/* ---- Images ---- */

type ImageType = 'Primary' | 'Logo' | 'Thumb' | 'Backdrop';

function imageUrl(serverUrl: string, id: string, type: ImageType, tag: string, size: { fillWidth?: number; fillHeight?: number }) {
  const q = new URLSearchParams({ quality: '90', tag });
  if (size.fillWidth) q.set('fillWidth', String(size.fillWidth));
  if (size.fillHeight) q.set('fillHeight', String(size.fillHeight));
  return `${serverUrl}/Items/${id}/Images/${type}?${q}`;
}

/** The item's logo, else its series' or parent's logo (jellyfin-web `logoImageUrl`). */
export function logoUrl(serverUrl: string, item: BaseItem): string {
  const own = item.ImageTags?.['Logo'];
  if (item.Id && own) return imageUrl(serverUrl, item.Id, 'Logo', own, { fillHeight: 240 });
  if (item.ParentLogoItemId && item.ParentLogoImageTag)
    return imageUrl(serverUrl, item.ParentLogoItemId, 'Logo', item.ParentLogoImageTag, { fillHeight: 240 });
  return '';
}

/** The item's backdrop, else its parent's (an episode wears its series' backdrop). */
export function detailBackdropUrl(serverUrl: string, item: BaseItem, fillWidth = 1920): string {
  const own = item.BackdropImageTags?.[0];
  if (item.Id && own) return imageUrl(serverUrl, item.Id, 'Backdrop', own, { fillWidth });
  const parent = item.ParentBackdropImageTags?.[0];
  if (item.ParentBackdropItemId && parent) return imageUrl(serverUrl, item.ParentBackdropItemId, 'Backdrop', parent, { fillWidth });
  return '';
}

/** A 16:9 card image: the episode's own still, else a thumb, else the series' thumb or backdrop. */
export function thumbUrl(serverUrl: string, item: BaseItem, fillWidth = 400): string {
  const primary = item.ImageTags?.['Primary'];
  if (item.Id && primary && (item.Type === 'Episode' || item.MediaType === 'Video'))
    return imageUrl(serverUrl, item.Id, 'Primary', primary, { fillWidth });
  const thumb = item.ImageTags?.['Thumb'];
  if (item.Id && thumb) return imageUrl(serverUrl, item.Id, 'Thumb', thumb, { fillWidth });
  if (item.ParentThumbItemId && item.ParentThumbImageTag)
    return imageUrl(serverUrl, item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag, { fillWidth });
  if (item.Id && primary) return imageUrl(serverUrl, item.Id, 'Primary', primary, { fillWidth });
  return '';
}

export function personImageUrl(serverUrl: string, person: { Id?: string | null; PrimaryImageTag?: string | null }): string {
  if (!person.Id || !person.PrimaryImageTag) return '';
  return imageUrl(serverUrl, person.Id, 'Primary', person.PrimaryImageTag, { fillWidth: 240 });
}

export function chapterImageUrl(serverUrl: string, itemId: string, index: number, tag: string): string {
  const q = new URLSearchParams({ fillWidth: '400', quality: '90', tag });
  return `${serverUrl}/Items/${itemId}/Images/Chapter/${index}?${q}`;
}

/* ---- What the page shows ---- */

/**
 * The primary info line, as jellyfin-web `fillPrimaryMediaInfo`: year (a
 * series shows its run), runtime, official rating, community rating,
 * critic rating, and "Ends at" for a video.
 */
export function primaryMediaInfo(item: BaseItem, now: Date = new Date()): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  if (item.Type === 'Series' && item.ProductionYear) {
    if (item.Status === 'Continuing') out.push({ key: 'year', text: `${item.ProductionYear} - Present` });
    else {
      const end = item.EndDate ? new Date(item.EndDate).getFullYear() : undefined;
      out.push({ key: 'year', text: end && end !== item.ProductionYear ? `${item.ProductionYear} - ${end}` : String(item.ProductionYear) });
    }
  } else if (item.Type === 'Episode' && item.PremiereDate) {
    out.push({ key: 'date', text: new Date(item.PremiereDate).toLocaleDateString() });
  } else if (item.ProductionYear && item.Type !== 'Person') {
    out.push({ key: 'year', text: String(item.ProductionYear) });
  }
  if (item.RunTimeTicks && item.Type !== 'Series' && item.Type !== 'Season' && !item.IsFolder)
    out.push({ key: 'runtime', text: formatRuntime(item.RunTimeTicks) });
  if (item.OfficialRating && item.Type !== 'Season' && item.Type !== 'Episode')
    out.push({ key: 'rating', text: item.OfficialRating });
  if (typeof item.CommunityRating === 'number' && item.CommunityRating > 0)
    out.push({ key: 'community', text: `★ ${item.CommunityRating.toFixed(1)}` });
  if (typeof item.CriticRating === 'number' && item.CriticRating > 0)
    out.push({ key: item.CriticRating >= 60 ? 'critic-fresh' : 'critic-rotten', text: `${item.CriticRating}%` });
  const ends = endsAt(item, now);
  if (ends) out.push({ key: 'ends', text: ends });
  return out;
}

/** "Ends at 21:45": now plus what is left to watch (jellyfin-web `getEndsAt`). */
export function endsAt(item: BaseItem, now: Date = new Date()): string {
  if (item.MediaType !== 'Video' || !item.RunTimeTicks || item.StartDate) return '';
  const left = item.RunTimeTicks - (item.UserData?.PlaybackPositionTicks ?? 0);
  if (left <= 0) return '';
  const at = new Date(now.getTime() + (left / TICKS_PER_SECOND) * 1000);
  return `Ends at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

type Person = components['schemas']['BaseItemPerson'];

/**
 * Cast & Crew and Guest Stars, as jellyfin-web: a writer, director or
 * producer listed twice is one card with both roles; artists are left out.
 */
export function splitPeople(people: Person[]): { cast: (Person & { roles: string[] })[]; guests: Person[] } {
  const cast: (Person & { roles: string[] })[] = [];
  const guests: Person[] = [];
  const crew = new Map<string, number>();
  for (const p of people) {
    if (p.Type === 'GuestStar') {
      guests.push(p);
      continue;
    }
    if (p.Type === 'Artist' || p.Type === 'AlbumArtist') continue;
    const role = p.Role || p.Type || '';
    const mergeable = !!p.Id && (p.Type === 'Writer' || p.Type === 'Director' || p.Type === 'Producer');
    const at = mergeable ? crew.get(p.Id!) : undefined;
    if (at !== undefined) {
      if (role && !cast[at]!.roles.includes(role)) cast[at]!.roles.push(role);
      continue;
    }
    if (mergeable) crew.set(p.Id!, cast.length);
    cast.push({ ...p, roles: role ? [role] : [] });
  }
  return { cast, guests };
}

/**
 * The "Directors", "Writers", "Studios", "Genres" lines under the overview.
 * People link to their page; studios and genres to their item list, as jellyfin-web.
 */
export function detailsGroup(item: BaseItem): { label: string; links: { name: string; to?: string }[] }[] {
  const people = item.People ?? [];
  const of = (type: string) =>
    people.filter((p) => p.Type === type).map((p) => ({ name: p.Name ?? '', to: p.Id ? detailsUrl(p.Id) : undefined }));
  const list = (refs: { Id?: string | null; Name?: string | null }[] | null | undefined, key: 'studioId' | 'genreId') =>
    (refs ?? []).map((r) => ({ name: r.Name ?? '', to: r.Id ? listUrl({ [key]: r.Id }) : undefined }));
  const rows = [
    { one: 'Director', many: 'Directors', links: of('Director') },
    { one: 'Writer', many: 'Writers', links: of('Writer') },
    { one: 'Studio', many: 'Studios', links: list(item.Studios, 'studioId') },
    { one: 'Genre', many: 'Genres', links: list(item.GenreItems, 'genreId') },
  ];
  return rows.filter((r) => r.links.length).map((r) => ({ label: r.links.length > 1 ? r.many : r.one, links: r.links }));
}

/* ---- Buttons and the More menu ---- */

/** Whether the player can open this item: a single video or audio file. */
export function isPlayable(item: { IsFolder?: boolean | null; MediaType?: string | null }): boolean {
  if (item.IsFolder) return false;
  return item.MediaType === 'Video' || item.MediaType === 'Audio';
}

/** Folders whose Play button plays their first episode or item (series, season, collection, playlist). */
export function playsChildren(item: BaseItem): boolean {
  return item.Type === 'Series' || item.Type === 'Season' || item.Type === 'BoxSet' || item.Type === 'Playlist';
}

/** jellyfin-web `itemHelper.canMarkPlayed`. */
export function canMarkPlayed(item: BaseItem): boolean {
  if (item.Type === 'Program') return false;
  if (item.MediaType === 'Video') return item.Type !== 'TvChannel';
  if (item.MediaType === 'Audio' && item.Type === 'AudioBook') return true;
  return ['Series', 'Season', 'BoxSet', 'Folder'].includes(item.Type ?? '') || item.MediaType === 'Book';
}

/** jellyfin-web `itemHelper.canRate`: the favorite button. */
export function canRate(item: BaseItem): boolean {
  return !['Program', 'Timer', 'SeriesTimer', 'CollectionFolder', 'UserView', 'Channel'].includes(item.Type ?? '') && !!item.UserData;
}

export type CommandId =
  | 'addtocollection'
  | 'addtoplaylist'
  | 'download'
  | 'copy-stream'
  | 'delete'
  | 'moremediainfo'
  | 'refresh';

function deleteLabel(type?: string | null): string {
  switch (type) {
    case 'Series':
      return 'Delete Series';
    case 'Episode':
      return 'Delete Episode';
    case 'Playlist':
    case 'BoxSet':
      return 'Delete';
    default:
      return 'Delete media';
  }
}

/**
 * The More (…) menu for a details page, with jellyfin-web's
 * `itemContextMenu.getCommands` conditions and order. Editing commands
 * (metadata, images, subtitles, Identify) are #95.
 */
export function itemCommands(item: BaseItem, user: Pick<User, 'Policy'>): { id: CommandId; name: string }[] {
  const policy = user.Policy;
  const type = item.Type ?? '';
  const local = (item.Id ?? '').startsWith('local');
  const out: { id: CommandId; name: string }[] = [];
  const recordingDone = !(type === 'Recording' && item.Status !== 'Completed');

  const collectionOk =
    !item.CollectionType &&
    !['Genre', 'MusicGenre', 'Studio', 'UserView', 'CollectionFolder', 'Audio', 'Program', 'Timer', 'SeriesTimer'].includes(type) &&
    item.MediaType !== 'Photo' &&
    recordingDone &&
    !local;
  if (collectionOk && (policy?.IsAdministrator || policy?.EnableCollectionManagement))
    out.push({ id: 'addtocollection', name: 'Add to collection' });

  const playlistOk =
    !['Program', 'TvChannel', 'Timer', 'SeriesTimer'].includes(type) &&
    item.MediaType !== 'Photo' &&
    recordingDone &&
    !local &&
    item.CollectionType !== 'livetv' &&
    !!(item.MediaType || item.IsFolder || type === 'Genre' || type === 'MusicGenre' || type === 'MusicArtist');
  if (playlistOk) out.push({ id: 'addtoplaylist', name: 'Add to playlist' });

  if (item.CanDownload && type !== 'Book') {
    out.push({ id: 'download', name: 'Download' });
    out.push({ id: 'copy-stream', name: 'Copy Stream URL' });
  }
  if (item.CanDelete) out.push({ id: 'delete', name: deleteLabel(type) });
  if (item.MediaSources) out.push({ id: 'moremediainfo', name: 'Media Info' });

  const refreshOk =
    !!policy?.IsAdministrator &&
    item.CollectionType !== 'livetv' &&
    !['Timer', 'SeriesTimer', 'Program', 'TvChannel'].includes(type) &&
    recordingDone &&
    !local;
  if (refreshOk) out.push({ id: 'refresh', name: 'Refresh metadata' });
  return out;
}

/** The confirmation text jellyfin-web shows before a delete. */
export function deleteConfirmation(item: BaseItem): string {
  switch (item.Type) {
    case 'Series':
      return `Deleting this series will delete ALL ${item.RecursiveItemCount ?? item.ChildCount ?? 0} episodes from both the file system and your media library. Are you sure you wish to continue?`;
    case 'BoxSet':
      return 'Are you sure you wish to delete this collection?';
    case 'Playlist':
      return 'Are you sure you wish to delete this playlist?';
    default:
      return `Deleting "${item.Name ?? ''}" will delete it from both the file system and your media library. Are you sure you wish to continue?`;
  }
}

/* ---- What Play and Shuffle start ---- */

async function firstItem(api: Api, query: Record<string, unknown>): Promise<BaseItem | undefined> {
  const { data, error } = await api.GET('/Items', { params: { query: { limit: 1, ...CARD, ...query } } });
  if (error !== undefined) throw new Error('Items failed');
  return data?.Items?.[0];
}

/**
 * What Play starts for a folder, until the player has a queue (#89): a
 * series its Next Up (else its first episode), a season its first
 * unplayed episode, a collection or playlist its first video.
 */
export async function playTarget(api: Api, userId: string, item: BaseItem): Promise<BaseItem | undefined> {
  const id = item.Id ?? '';
  switch (item.Type) {
    case 'Series': {
      const { data } = await api.GET('/Shows/NextUp', { params: { query: { userId, seriesId: id, limit: 1, ...CARD } } });
      const next = data?.Items?.[0];
      if (next) return next;
      const first = await api.GET('/Shows/{seriesId}/Episodes', { params: { path: { seriesId: id }, query: { userId, limit: 1, ...CARD } } });
      return first.data?.Items?.[0];
    }
    case 'Season': {
      const { data } = await api.GET('/Shows/{seriesId}/Episodes', {
        params: { path: { seriesId: item.SeriesId ?? '' }, query: { userId, seasonId: id, limit: 100, ...CARD } },
      });
      const eps = data?.Items ?? [];
      return eps.find((e) => !e.UserData?.Played) ?? eps[0];
    }
    case 'Playlist': {
      const { data } = await api.GET('/Playlists/{playlistId}/Items', { params: { path: { playlistId: id }, query: { userId, limit: 1, ...CARD } } });
      return data?.Items?.[0];
    }
    default:
      return firstItem(api, {
        userId,
        parentId: id,
        recursive: true,
        isFolder: false,
        mediaTypes: ['Video'],
        sortBy: ['PremiereDate', 'ProductionYear', 'SortName'],
      });
  }
}

/** What Shuffle starts: one random video under the folder. */
export function shuffleTarget(api: Api, userId: string, item: BaseItem): Promise<BaseItem | undefined> {
  return firstItem(api, { userId, parentId: item.Id ?? '', recursive: true, isFolder: false, mediaTypes: ['Video'], sortBy: ['Random'] });
}
