import type { Api } from './client';
import type { components } from './schema';

type Prefs = Record<string, string | null | undefined> | null | undefined;

export type GuideIndicator = 'hd' | 'live' | 'new' | 'premiere' | 'repeat';

/**
 * The guide settings, as jellyfin-web's guide-settings dialog keeps them in
 * the `usersettings` display preferences (client `emby`), so both clients
 * share them.
 */
export interface GuideSettings {
  /** `livetv-channelorder`: Number (the server's order) or DatePlayed. */
  channelOrder: 'Number' | 'DatePlayed';
  /** `livetv-favoritechannelsattop`, on unless 'false'. */
  favoritesAtTop: boolean;
  /** `guide-indicator-*`: HD and Repeat are off unless 'true', the others on unless 'false'. */
  indicators: Record<GuideIndicator, boolean>;
  /** `guide-colorcodedbackgrounds`, off unless 'true'. */
  colorCoded: boolean;
}

const ON_BY_DEFAULT: Record<GuideIndicator, boolean> = { hd: false, live: true, new: true, premiere: true, repeat: false };

export const DEFAULT_GUIDE_SETTINGS: GuideSettings = parseGuideSettings(null);

export function parseGuideSettings(prefs: Prefs): GuideSettings {
  const flag = (key: string, def: boolean) => (def ? prefs?.[key] !== 'false' : prefs?.[key] === 'true');
  const indicators = {} as Record<GuideIndicator, boolean>;
  for (const [k, def] of Object.entries(ON_BY_DEFAULT) as [GuideIndicator, boolean][]) indicators[k] = flag(`guide-indicator-${k}`, def);
  return {
    channelOrder: prefs?.['livetv-channelorder'] === 'DatePlayed' ? 'DatePlayed' : 'Number',
    favoritesAtTop: flag('livetv-favoritechannelsattop', true),
    indicators,
    colorCoded: flag('guide-colorcodedbackgrounds', false),
  };
}

/** The keys a save writes, as jellyfin-web `userSettings.set` stores them. */
export function guideSettingsPrefs(s: GuideSettings): Record<string, string> {
  const out: Record<string, string> = {
    'livetv-channelorder': s.channelOrder,
    'livetv-favoritechannelsattop': String(s.favoritesAtTop),
    'guide-colorcodedbackgrounds': String(s.colorCoded),
  };
  for (const [k, on] of Object.entries(s.indicators)) out[`guide-indicator-${k}`] = String(on);
  return out;
}

type DisplayPreferences = components['schemas']['DisplayPreferencesDto'];

async function fetchUserSettings(api: Api, userId: string): Promise<DisplayPreferences | undefined> {
  const { data, error } = await api.GET('/DisplayPreferences/{displayPreferencesId}', {
    params: { path: { displayPreferencesId: 'usersettings' }, query: { userId, client: 'emby' } },
  });
  if (error !== undefined) return undefined;
  return data;
}

export async function fetchGuideSettings(api: Api, userId: string): Promise<GuideSettings> {
  return parseGuideSettings((await fetchUserSettings(api, userId))?.CustomPrefs);
}

/** Merges the guide keys into the stored preferences, so other settings (home sections…) stay. */
export async function saveGuideSettings(api: Api, userId: string, s: GuideSettings): Promise<void> {
  const stored = (await fetchUserSettings(api, userId)) ?? {};
  const body = { ...stored, CustomPrefs: { ...(stored.CustomPrefs ?? {}), ...guideSettingsPrefs(s) } } as DisplayPreferences;
  const { error } = await api.POST('/DisplayPreferences/{displayPreferencesId}', {
    params: { path: { displayPreferencesId: 'usersettings' }, query: { userId, client: 'emby' } },
    body,
  });
  if (error !== undefined) throw new Error('Saving the guide settings failed.');
}

export type GuideCategory = 'movies' | 'sports' | 'kids' | 'news';
export const GUIDE_CATEGORIES: { key: GuideCategory; label: string }[] = [
  { key: 'movies', label: 'Movies' },
  { key: 'sports', label: 'Sports' },
  { key: 'kids', label: 'Kids' },
  { key: 'news', label: 'News' },
];

/**
 * The channel query for the picked categories, as jellyfin-web's guide:
 * all four (or none picked) is no filter; otherwise each picked category
 * is asked for, and series are left out.
 */
export function categoryQuery(picked: GuideCategory[]): { isMovie?: boolean; isSports?: boolean; isKids?: boolean; isNews?: boolean } {
  if (picked.length === 0 || picked.length === GUIDE_CATEGORIES.length) return {};
  const q: Record<string, boolean> = {};
  if (picked.includes('movies')) q.isMovie = true;
  if (picked.includes('sports')) q.isSports = true;
  if (picked.includes('kids')) q.isKids = true;
  if (picked.includes('news')) q.isNews = true;
  return q;
}

/** A programme's category, in jellyfin-web's order (Kids, Sports, News, Movie, Series), for colours and the filter. */
export function programCategory(p: { IsKids?: boolean | null; IsSports?: boolean | null; IsNews?: boolean | null; IsMovie?: boolean | null; IsSeries?: boolean | null }):
  | 'kids'
  | 'sports'
  | 'news'
  | 'movie'
  | 'series'
  | null {
  if (p.IsKids) return 'kids';
  if (p.IsSports) return 'sports';
  if (p.IsNews) return 'news';
  if (p.IsMovie) return 'movie';
  if (p.IsSeries) return 'series';
  return null;
}

/**
 * Whether a programme's title is drawn under the picked categories, as
 * jellyfin-web `displayInnerContent`: a categorised programme shows when
 * its category is picked (series only when all four are), an uncategorised
 * one only with no filter.
 */
export function showsProgram(p: Parameters<typeof programCategory>[0], picked: GuideCategory[]): boolean {
  const all = picked.length === 0 || picked.length === GUIDE_CATEGORIES.length;
  switch (programCategory(p)) {
    case 'kids':
      return all || picked.includes('kids');
    case 'sports':
      return all || picked.includes('sports');
    case 'news':
      return all || picked.includes('news');
    case 'movie':
      return all || picked.includes('movies');
    default:
      return all;
  }
}
