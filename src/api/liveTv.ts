import { authorizationHeader, type Api } from './client';
import type { components } from './schema';
import { deviceId } from './session';

/** A tuner with Deadfin's group filter fields (server divergence D-91). */
export type TunerHost = components['schemas']['TunerHostInfo'] & {
  IncludeGroups?: string[] | null;
  ExcludeGroups?: string[] | null;
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

/** The M3U tuners of the server's Live TV configuration (admin only). */
export async function fetchM3UTuners(api: Api): Promise<TunerHost[]> {
  const { data, error, response } = await api.GET('/System/Configuration/{key}', {
    params: { path: { key: 'livetv' } },
  });
  if (error !== undefined) {
    throw new Error(response.status === 403 ? 'Live TV settings need an administrator.' : 'Live TV settings failed.');
  }
  const tuners = (data as unknown as { TunerHosts?: TunerHost[] | null } | undefined)?.TunerHosts ?? [];
  return tuners.filter((t) => t.Type?.toLowerCase() === 'm3u' && t.Id);
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

/**
 * Saves the filter with POST /LiveTv/TunerHosts. A save that changes only
 * the group lists reuses the server's cached playlist; it queues a guide
 * refresh, which applies the filter.
 */
export async function saveTunerFilter(api: Api, tuner: TunerHost, mode: GroupMode, selected: string[]): Promise<TunerHost> {
  const body = { ...tuner, ...filterLists(mode, selected) };
  const { data, error } = await api.POST('/LiveTv/TunerHosts', { body });
  if (error !== undefined) throw new Error('Saving the tuner failed.');
  return (data as TunerHost | undefined) ?? body;
}
