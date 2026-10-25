import type { Api } from '../client';
import { check } from './check';

/**
 * Live TV channel lists: playlists whose entries are Live TV channels
 * (Deadfin D-94). A user with `LimitLiveTvToSharedLists` (D-105) sees only
 * the channels of the lists that are public, theirs, or shared with them.
 * Share and unshare need the owner's session; the signed-in administrator
 * owns the lists this page makes.
 */
export interface ChannelList {
  Id: string;
  Name: string;
  /** Channels in the list. */
  Count: number;
}

/** One entry of a list: the channel and the playlist entry id that removes it. */
export interface ListChannel {
  Id: string;
  EntryId: string;
  Name: string;
  Number: string;
  /** The M3U group-title (D-90). */
  Group: string;
}

/** The sharing state of a list, from `GET /Playlists/{id}`. */
export interface ListAccess {
  Public: boolean;
  /** User ids, in the normalized form of `sameId`. */
  Users: string[];
}

/** Ids per add or remove request, so the URL stays short. */
export const ID_CHUNK = 100;
/** Entries per read of a list. */
const ENTRY_PAGE = 1000;

/** The prefix of the curated lists' names ("Live TV · US"). */
export const LIST_PREFIX = 'Live TV · ';

/** A list name without the "Live TV · " prefix, for short labels. */
export function shortListName(name: string): string {
  return name.startsWith(LIST_PREFIX) && name.length > LIST_PREFIX.length ? name.slice(LIST_PREFIX.length) : name;
}

/** Ids compare without dashes and case: the server writes either form. */
export function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

function chunks<T>(all: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

/**
 * The playlists `userId` can see that hold Live TV channels, by name. An
 * empty playlist counts too: a new list has no channels yet.
 */
export async function fetchChannelLists(api: Api, userId: string): Promise<ChannelList[]> {
  const { data, error, response } = await api.GET('/Items', {
    params: { query: { userId, includeItemTypes: ['Playlist'], recursive: true, sortBy: ['SortName'], enableImages: false } },
  });
  check('Reading the playlists', error, response);
  const playlists = (data?.Items ?? []).filter((p) => p.Id);
  const lists = await Promise.all(
    playlists.map(async (p): Promise<ChannelList | null> => {
      const r = await api.GET('/Playlists/{playlistId}/Items', {
        params: { path: { playlistId: p.Id! }, query: { userId, limit: 1, enableImages: false, enableUserData: false } },
      });
      check(`Reading the playlist "${p.Name}"`, r.error, r.response);
      const first = r.data?.Items?.[0];
      if (first && first.Type !== 'TvChannel') return null;
      return { Id: p.Id!, Name: p.Name ?? p.Id!, Count: r.data?.TotalRecordCount ?? 0 };
    }),
  );
  return lists.filter((l): l is ChannelList => l !== null);
}

/** Who can see a list. Only the owner can read the shares. */
export async function fetchListAccess(api: Api, listId: string): Promise<ListAccess> {
  const { data, error, response } = await api.GET('/Playlists/{playlistId}', { params: { path: { playlistId: listId } } });
  check('Reading the list shares', error, response);
  return {
    Public: !!data?.OpenAccess,
    Users: (data?.Shares ?? []).filter((s) => s.UserId).map((s) => normalizeId(s.UserId!)),
  };
}

/** Every channel of a list, in list order. */
export async function fetchListChannels(api: Api, userId: string, listId: string): Promise<ListChannel[]> {
  const out: ListChannel[] = [];
  for (;;) {
    const { data, error, response } = await api.GET('/Playlists/{playlistId}/Items', {
      params: {
        path: { playlistId: listId },
        query: { userId, startIndex: out.length, limit: ENTRY_PAGE, fields: ['Tags'], enableImages: false, enableUserData: false },
      },
    });
    check('Reading the channels', error, response);
    const items = data?.Items ?? [];
    for (const i of items) {
      if (!i.Id) continue;
      out.push({
        Id: i.Id,
        EntryId: i.PlaylistItemId ?? i.Id,
        Name: i.Name ?? '',
        Number: i.ChannelNumber ?? i.Number ?? '',
        Group: i.Tags?.[0] ?? '',
      });
    }
    if (items.length < ENTRY_PAGE || out.length >= (data?.TotalRecordCount ?? 0)) return out;
  }
}

/** The M3U groups of all Live TV channels (`/Items/Filters` tags). */
export async function fetchChannelGroups(api: Api, userId: string): Promise<string[]> {
  const { data, error, response } = await api.GET('/Items/Filters', {
    params: { query: { userId, includeItemTypes: ['TvChannel'] } },
  });
  check('Reading the channel groups', error, response);
  return [...(data?.Tags ?? [])].sort((a, b) => a.localeCompare(b));
}

/** Live TV channels for the add picker: one group, a search text, or both. */
export async function findChannels(
  api: Api,
  userId: string,
  q: { group?: string; text?: string; startIndex?: number; limit?: number },
): Promise<{ channels: ListChannel[]; total: number }> {
  const { data, error, response } = await api.GET('/Items', {
    params: {
      query: {
        userId,
        includeItemTypes: ['TvChannel'],
        recursive: true,
        sortBy: ['SortName'],
        fields: ['Tags'],
        enableImages: false,
        enableUserData: false,
        ...(q.group ? { tags: [q.group] } : {}),
        ...(q.text ? { searchTerm: q.text } : {}),
        ...(q.startIndex ? { startIndex: q.startIndex } : {}),
        ...(q.limit != null ? { limit: q.limit } : {}),
      },
    },
  });
  check('Reading the channels', error, response);
  const channels = (data?.Items ?? [])
    .filter((i) => i.Id)
    .map((i) => ({
      Id: i.Id!,
      EntryId: i.Id!,
      Name: i.Name ?? '',
      Number: i.ChannelNumber ?? i.Number ?? '',
      Group: i.Tags?.[0] ?? '',
    }));
  return { channels, total: data?.TotalRecordCount ?? channels.length };
}

/** Makes an empty list that only the owner sees. The server makes a list public when the body leaves IsPublic out. */
export async function createChannelList(api: Api, userId: string, name: string): Promise<string> {
  const { data, error, response } = await api.POST('/Playlists', {
    body: { Name: name, UserId: userId, MediaType: 'Video', IsPublic: false, Users: [] },
  });
  check(`Making the list "${name}"`, error, response);
  return data?.Id ?? '';
}

/** Saves the name and the public flag. Entries and shares do not change. */
export async function updateChannelList(api: Api, listId: string, change: { Name?: string; IsPublic?: boolean }): Promise<void> {
  const { error, response } = await api.POST('/Playlists/{playlistId}', { params: { path: { playlistId: listId } }, body: change });
  check('Saving the list', error, response);
}

export async function deleteChannelList(api: Api, listId: string): Promise<void> {
  const { error, response } = await api.DELETE('/Items/{itemId}', { params: { path: { itemId: listId } } });
  check('Deleting the list', error, response);
}

/** Adds channels at the end of a list, ID_CHUNK per request. */
export async function addListChannels(api: Api, userId: string, listId: string, channelIds: string[]): Promise<void> {
  for (const ids of chunks(channelIds)) {
    const { error, response } = await api.POST('/Playlists/{playlistId}/Items', {
      params: { path: { playlistId: listId }, query: { ids, userId } },
    });
    check('Adding the channels', error, response);
  }
}

/** Removes list entries (PlaylistItemId), ID_CHUNK per request. */
export async function removeListChannels(api: Api, listId: string, entryIds: string[]): Promise<void> {
  for (const ids of chunks(entryIds)) {
    const { error, response } = await api.DELETE('/Playlists/{playlistId}/Items', {
      params: { path: { playlistId: listId }, query: { entryIds: ids } },
    });
    check('Removing the channels', error, response);
  }
}

/**
 * The shares a save must change: lists to share with the user and lists to
 * unshare. `current` holds the lists shared now; `wanted` the checked ones.
 * A public list is open to all users, so a save leaves it alone.
 */
export function shareChanges(
  current: ReadonlySet<string>,
  wanted: ReadonlySet<string>,
  publicLists: ReadonlySet<string> = new Set(),
): { share: string[]; unshare: string[] } {
  const share = [...wanted].filter((id) => !current.has(id) && !publicLists.has(id));
  const unshare = [...current].filter((id) => !wanted.has(id) && !publicLists.has(id));
  return { share, unshare };
}

/** Shares and unshares lists with one user. Each share is read-only (CanEdit false). */
export async function applyShareChanges(
  api: Api,
  userId: string,
  changes: { share: string[]; unshare: string[] },
): Promise<void> {
  for (const playlistId of changes.share) {
    const { error, response } = await api.POST('/Playlists/{playlistId}/Users/{userId}', {
      params: { path: { playlistId, userId } },
      body: { CanEdit: false },
    });
    check('Sharing the list', error, response);
  }
  for (const playlistId of changes.unshare) {
    const { error, response } = await api.DELETE('/Playlists/{playlistId}/Users/{userId}', {
      params: { path: { playlistId, userId } },
    });
    check('Unsharing the list', error, response);
  }
}
