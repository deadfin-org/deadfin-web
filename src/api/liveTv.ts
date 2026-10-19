import { authorizationHeader, type Api } from './client';
import type { components } from './schema';
import { deviceId } from './session';

/**
 * A tuner with Deadfin's own fields: the group filter (D-91), VOD skip and
 * playlist refresh floor (D-78), and stream open interval (D-93). A save
 * that omits one of them keeps the stored value.
 */
export type TunerHost = components['schemas']['TunerHostInfo'] & {
  IncludeGroups?: string[] | null;
  ExcludeGroups?: string[] | null;
  SkipVodEntries?: boolean | null;
  PlaylistRefreshMinutes?: number | null;
  StreamOpenIntervalMs?: number | null;
};

export type ListingsProvider = components['schemas']['ListingsProviderInfo'];
export type TaskInfo = components['schemas']['TaskInfo'];

/** The `livetv` named configuration, as the dashboard reads it. */
export type LiveTvOptions = Omit<components['schemas']['LiveTvOptions'], 'TunerHosts'> & {
  TunerHosts?: TunerHost[] | null;
};

export interface GroupCount {
  Name: string;
  Count: number;
}

/** The groups of a tuner's cached playlist; Loaded is false before the first read. */
export interface TunerGroups {
  Groups: GroupCount[];
  Loaded: boolean;
}

export type GroupMode = 'all' | 'include' | 'exclude';

/** Group names match after trimming, ignoring case, as on the server. */
export function groupKey(name: string): string {
  return name.trim().toLowerCase();
}

/** GET /deadfin/v1/livetv/tunerhosts/{id}/groups: counts from the cached playlist, no provider fetch. */
export async function fetchTunerGroups(
  serverUrl: string,
  token: string,
  tunerId: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<TunerGroups> {
  const res = await fetchImpl(`${serverUrl}/deadfin/v1/livetv/tunerhosts/${encodeURIComponent(tunerId)}/groups`, {
    headers: { Authorization: authorizationHeader({ deviceId: deviceId(), token }), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Tuner groups failed (HTTP ${res.status}).`);
  const body = (await res.json()) as Partial<TunerGroups>;
  return { Groups: body.Groups ?? [], Loaded: body.Loaded ?? false };
}

/** The picker state a stored tuner starts from. */
export function initialFilter(tuner: TunerHost): { mode: GroupMode; selected: string[] } {
  if (tuner.IncludeGroups?.length) return { mode: 'include', selected: tuner.IncludeGroups };
  if (tuner.ExcludeGroups?.length) return { mode: 'exclude', selected: tuner.ExcludeGroups };
  return { mode: 'all', selected: [] };
}

/** The lists a save sends; both are always present, so a save clears the other list. */
export function filterLists(mode: GroupMode, selected: string[]): { IncludeGroups: string[]; ExcludeGroups: string[] } {
  if (mode === 'include') return { IncludeGroups: selected, ExcludeGroups: [] };
  if (mode === 'exclude') return { IncludeGroups: [], ExcludeGroups: selected };
  return { IncludeGroups: [], ExcludeGroups: [] };
}

/** How many channels the filter keeps. */
export function keptChannels(groups: GroupCount[], mode: GroupMode, selected: string[]): number {
  const keys = new Set(selected.map(groupKey));
  return groups.reduce((n, g) => {
    const picked = keys.has(groupKey(g.Name));
    const kept = mode === 'all' || (mode === 'include' ? picked : !picked);
    return kept ? n + g.Count : n;
  }, 0);
}

/** GET /System/Configuration/livetv: tuners, guide providers, guide days (admin only). */
export async function fetchLiveTvOptions(api: Api): Promise<LiveTvOptions> {
  const { data, error, response } = await api.GET('/System/Configuration/{key}', {
    params: { path: { key: 'livetv' } },
  });
  if (error !== undefined) {
    if (response.status === 403) throw new Error('Live TV settings need an administrator.');
    // Deadfin before the v0.4 line has no Live TV and no `livetv` key.
    if (response.status === 404) throw new Error('This server has no Live TV settings.');
    throw new Error('Live TV settings failed.');
  }
  return (data ?? {}) as LiveTvOptions;
}

/** Tuner type names, as jellyfin-web features/livetv/utils/getTunerName.ts. */
export function tunerTypeName(type: string | null | undefined): string {
  switch (type?.toLowerCase()) {
    case 'm3u':
      return 'M3U';
    case 'hdhomerun':
      return 'HDHomeRun';
    case 'hauppauge':
      return 'Hauppauge';
    case 'satip':
      return 'DVB';
    default:
      return 'Unknown';
  }
}

/** Guide provider names, as jellyfin-web features/livetv/utils/getProviderName.ts. */
export function providerTypeName(type: string | null | undefined): string {
  switch (type?.toLowerCase()) {
    case 'schedulesdirect':
      return 'Schedules Direct';
    case 'xmltv':
      return 'XMLTV';
    default:
      return 'Unknown';
  }
}

/**
 * A tuner or playlist URL without its query and credentials, for lists:
 * Xtream playlist URLs carry the account name and password.
 */
export function displayUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    return url;
  }
}

/** GET /LiveTv/TunerHosts/Types: the tuner types the server supports. */
export async function fetchTunerHostTypes(api: Api): Promise<{ Id: string; Name: string }[]> {
  const { data, error } = await api.GET('/LiveTv/TunerHosts/Types');
  if (error !== undefined) throw new Error('Loading the tuner types failed.');
  return (data ?? []).filter((t) => t.Id).map((t) => ({ Id: t.Id!, Name: t.Name ?? t.Id! }));
}

/** GET /LiveTv/Tuners/Discover: tuner devices on the server's network not yet added. */
export async function discoverTuners(api: Api): Promise<TunerHost[]> {
  const { data, error } = await api.GET('/LiveTv/Tuners/Discover', { params: { query: { newDevicesOnly: true } } });
  if (error !== undefined) throw new Error('Detecting devices failed.');
  return (data ?? []) as TunerHost[];
}

/**
 * POST /LiveTv/TunerHosts. The body is the stored tuner with the form on
 * top, so fields this client does not show keep their values. On Deadfin a
 * save also drops the cached playlist and queues a guide refresh.
 */
export async function saveTunerHost(api: Api, stored: TunerHost | undefined, form: TunerHost): Promise<TunerHost> {
  const body = { ...stored, ...form };
  const { data, error } = await api.POST('/LiveTv/TunerHosts', { body });
  if (error !== undefined) throw new Error('There was an error saving the TV provider. Please ensure it is accessible and try again.');
  return (data as TunerHost | undefined) ?? body;
}

export async function deleteTunerHost(api: Api, id: string): Promise<void> {
  const { error } = await api.DELETE('/LiveTv/TunerHosts', { params: { query: { id } } });
  if (error !== undefined) throw new Error('Deleting the tuner failed.');
}

/** GET /LiveTv/ListingProviders/Default: the defaults of a new guide provider. */
export async function fetchDefaultListingProvider(api: Api): Promise<ListingsProvider> {
  const { data, error } = await api.GET('/LiveTv/ListingProviders/Default');
  if (error !== undefined) throw new Error('Loading the guide provider defaults failed.');
  return data ?? {};
}

/**
 * POST /LiveTv/ListingProviders. `validateListings` makes the server read
 * the XMLTV file or lineup first; `validateLogin` checks a Schedules Direct
 * account.
 */
export async function saveListingProvider(
  api: Api,
  info: ListingsProvider,
  opts: { validateListings?: boolean; validateLogin?: boolean },
): Promise<ListingsProvider> {
  const { data, error } = await api.POST('/LiveTv/ListingProviders', { params: { query: opts }, body: info });
  if (error !== undefined) throw new Error('Saving the guide provider failed.');
  return data ?? info;
}

export async function deleteListingProvider(api: Api, id: string): Promise<void> {
  const { error } = await api.DELETE('/LiveTv/ListingProviders', { params: { query: { id } } });
  if (error !== undefined) throw new Error('Deleting the guide provider failed.');
}

/** Schedules Direct countries, sorted by name, as jellyfin-web's provider page lists them. */
export async function fetchSchedulesDirectCountries(api: Api): Promise<{ name: string; value: string }[]> {
  const { data, error } = await api.GET('/LiveTv/ListingProviders/SchedulesDirect/Countries');
  if (error !== undefined) throw new Error('There was an error downloading TV lineups. Please ensure your information is correct and try again.');
  const regions = (data ?? {}) as Record<string, { fullName?: string; shortName?: string }[]>;
  const out: { name: string; value: string }[] = [];
  for (const [region, countries] of Object.entries(regions)) {
    if (region === 'ZZZ' || !Array.isArray(countries)) continue;
    for (const c of countries) if (c.shortName) out.push({ name: c.fullName ?? c.shortName, value: c.shortName });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchLineups(api: Api, id: string, country: string, location: string): Promise<{ Id: string; Name: string }[]> {
  const { data, error } = await api.GET('/LiveTv/ListingProviders/Lineups', {
    params: { query: { id, type: 'SchedulesDirect', country, location } },
  });
  if (error !== undefined) throw new Error('There was an error downloading TV lineups. Please ensure your information is correct and try again.');
  return (data ?? []).filter((l) => l.Id).map((l) => ({ Id: l.Id!, Name: l.Name ?? l.Id! }));
}

export interface ChannelMappingOptions {
  TunerChannels: { Id: string; Name: string; ProviderChannelName?: string | null; ProviderChannelId?: string | null }[];
  ProviderChannels: { Id: string; Name: string }[];
  ProviderName: string;
}

/** GET /LiveTv/ChannelMappingOptions. On a large playlist this is tens of thousands of rows. */
export async function fetchChannelMappingOptions(api: Api, providerId: string): Promise<ChannelMappingOptions> {
  const { data, error } = await api.GET('/LiveTv/ChannelMappingOptions', { params: { query: { providerId } } });
  if (error !== undefined || !data) throw new Error('Loading the channels failed.');
  return {
    TunerChannels: (data.TunerChannels ?? []).map((c) => ({ ...c, Id: c.Id ?? '', Name: c.Name ?? '' })),
    ProviderChannels: (data.ProviderChannels ?? []).map((c) => ({ Id: c.Id ?? '', Name: c.Name ?? '' })),
    ProviderName: data.ProviderName ?? '',
  };
}

/** POST /LiveTv/ChannelMappings: maps one tuner channel to a guide channel. */
export async function setChannelMapping(
  api: Api,
  providerId: string,
  tunerChannelId: string,
  providerChannelId: string,
): Promise<{ ProviderChannelName?: string | null; ProviderChannelId?: string | null }> {
  const { data, error } = await api.POST('/LiveTv/ChannelMappings', {
    body: { ProviderId: providerId, TunerChannelId: tunerChannelId, ProviderChannelId: providerChannelId },
  });
  if (error !== undefined) throw new Error('Mapping the channel failed.');
  return data ?? {};
}

/** The Refresh Guide scheduled task (key `RefreshGuide`), or undefined when the server has none. */
export async function fetchRefreshGuideTask(api: Api): Promise<TaskInfo | undefined> {
  const { data, error } = await api.GET('/ScheduledTasks', { params: { query: { isHidden: false } } });
  if (error !== undefined) throw new Error('Loading the scheduled tasks failed.');
  return (data ?? []).find((t) => t.Key === 'RefreshGuide');
}

export async function startTask(api: Api, taskId: string): Promise<void> {
  const { error } = await api.POST('/ScheduledTasks/Running/{taskId}', { params: { path: { taskId } } });
  if (error !== undefined) throw new Error('Starting the task failed.');
}
