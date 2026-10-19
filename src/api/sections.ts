import type { Api } from './client';
import type { BaseItem, ItemKind } from './library';

/** What a card shows, and nothing more: user data and the Primary image. */
const CARD = {
  enableUserData: true,
  imageTypeLimit: 1,
  enableImageTypes: ['Primary' as const],
};

function items<T extends { Items?: BaseItem[] | null }>(res: { data?: T; error?: unknown }, what: string): BaseItem[] {
  if (res.error !== undefined) throw new Error(`${what} failed`);
  return res.data?.Items ?? [];
}

export type ResumeMedia = 'Video' | 'Audio' | 'Book';

/** Continue Watching / Listening / Reading. */
export async function fetchResume(api: Api, userId: string, opts: { mediaType: ResumeMedia; parentId?: string; limit?: number }) {
  return items(
    await api.GET('/UserItems/Resume', {
      params: {
        query: {
          userId,
          parentId: opts.parentId,
          mediaTypes: [opts.mediaType],
          limit: opts.limit ?? 12,
          enableTotalRecordCount: false,
          ...CARD,
        },
      },
    }),
    'Resume',
  );
}

/** Recently added, grouped the server's way (episodes fold into their series). */
export async function fetchLatest(api: Api, userId: string, opts: { parentId?: string; itemTypes?: ItemKind[]; limit?: number }) {
  const { data, error } = await api.GET('/Items/Latest', {
    params: { query: { userId, parentId: opts.parentId, includeItemTypes: opts.itemTypes, limit: opts.limit ?? 16, ...CARD } },
  });
  if (error !== undefined) throw new Error('Latest failed');
  return data ?? [];
}

export async function fetchNextUpIn(api: Api, userId: string, opts: { parentId?: string; limit?: number }) {
  return items(
    await api.GET('/Shows/NextUp', {
      params: {
        query: { userId, parentId: opts.parentId, limit: opts.limit ?? 24, enableTotalRecordCount: false, enableResumable: false, ...CARD },
      },
    }),
    'NextUp',
  );
}

/** Recently or frequently played items of a library. */
export async function fetchPlayed(api: Api, userId: string, opts: { parentId?: string; itemTypes: ItemKind[]; sortBy: 'DatePlayed' | 'PlayCount' }) {
  return items(
    await api.GET('/Items', {
      params: {
        query: {
          userId,
          parentId: opts.parentId,
          includeItemTypes: opts.itemTypes,
          recursive: true,
          filters: ['IsPlayed'],
          sortBy: [opts.sortBy],
          sortOrder: ['Descending'],
          limit: 12,
          enableTotalRecordCount: false,
          ...CARD,
        },
      },
    }),
    'Played',
  );
}

export interface Recommendation {
  title: string;
  items: BaseItem[];
}

const BECAUSE: Record<string, string> = {
  SimilarToRecentlyPlayed: 'Because you watched {0}',
  SimilarToLikedItem: 'Because you like {0}',
  HasDirectorFromRecentlyPlayed: 'Directed by {0}',
  HasLikedDirector: 'Directed by {0}',
  HasActorFromRecentlyPlayed: 'Starring {0}',
  HasLikedActor: 'Starring {0}',
};

export async function fetchRecommendations(api: Api, userId: string, parentId?: string): Promise<Recommendation[]> {
  const { data, error } = await api.GET('/Movies/Recommendations', {
    params: { query: { userId, parentId, categoryLimit: 6, itemLimit: 12 } },
  });
  if (error !== undefined) throw new Error('Recommendations failed');
  return (data ?? [])
    .filter((r) => r.Items?.length)
    .map((r) => ({
      title: (BECAUSE[r.RecommendationType ?? ''] ?? '{0}').replace('{0}', r.BaselineItemName ?? ''),
      items: r.Items ?? [],
    }));
}

export async function fetchUpcoming(api: Api, userId: string, parentId?: string) {
  return items(
    await api.GET('/Shows/Upcoming', { params: { query: { userId, parentId, limit: 48, ...CARD } } }),
    'Upcoming',
  );
}

/** Live TV "On Now". */
export async function fetchOnNow(api: Api, userId: string) {
  return items(
    await api.GET('/LiveTv/Programs/Recommended', {
      params: { query: { userId, isAiring: true, limit: 24, enableTotalRecordCount: false, ...CARD } },
    }),
    'On Now',
  );
}

export async function fetchActiveRecordings(api: Api, userId: string) {
  return items(
    await api.GET('/LiveTv/Recordings', {
      params: { query: { userId, isInProgress: true, limit: 12, enableTotalRecordCount: false, ...CARD } },
    }),
    'Recordings',
  );
}

/** Groups upcoming episodes by air date, in order. */
export function groupByDay(list: BaseItem[], now = new Date()): { label: string; items: BaseItem[] }[] {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  const groups = new Map<string, BaseItem[]>();
  for (const item of list) {
    const d = item.PremiereDate ? new Date(item.PremiereDate) : null;
    let label = 'Unknown';
    if (d && !Number.isNaN(d.getTime())) {
      const diff = Math.round((day(d) - today) / 86_400_000);
      label =
        diff === 0
          ? 'Today'
          : diff === 1
            ? 'Tomorrow'
            : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }
    const g = groups.get(label) ?? [];
    g.push(item);
    groups.set(label, g);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

/** Home section keys, as jellyfin-web `HomeSectionType`. */
export type HomeSection =
  | 'smalllibrarytiles'
  | 'librarybuttons'
  | 'activerecordings'
  | 'resume'
  | 'resumeaudio'
  | 'resumebook'
  | 'latestmedia'
  | 'nextup'
  | 'livetv'
  | 'none';

/** The server's default order (DisplayPreferencesController). */
export const DEFAULT_SECTIONS: HomeSection[] = [
  'smalllibrarytiles',
  'resume',
  'resumeaudio',
  'resumebook',
  'livetv',
  'nextup',
  'latestmedia',
  'none',
  'none',
  'none',
];

const KNOWN = new Set<string>(DEFAULT_SECTIONS.concat(['librarybuttons', 'activerecordings']));

/** homesection0–9 from the jellyfin-web display preferences, falling back to the default per slot. */
export function homeSections(prefs?: Record<string, string | null> | null): HomeSection[] {
  const out: HomeSection[] = [];
  for (let i = 0; i < 10; i++) {
    let s = prefs?.[`homesection${i}`]?.toLowerCase() || DEFAULT_SECTIONS[i]!;
    if (s === 'folders') s = DEFAULT_SECTIONS[0]!;
    if (!KNOWN.has(s)) s = 'none';
    out.push(s as HomeSection);
  }
  return out;
}

/**
 * The display preferences jellyfin-web keeps its home order in
 * (`usersettings`, client `emby`), so both clients show one order.
 */
export async function fetchHomeSections(api: Api, userId: string): Promise<HomeSection[]> {
  const { data, error } = await api.GET('/DisplayPreferences/{displayPreferencesId}', {
    params: { path: { displayPreferencesId: 'usersettings' }, query: { userId, client: 'emby' } },
  });
  if (error !== undefined) return homeSections(null);
  return homeSections(data?.CustomPrefs);
}
