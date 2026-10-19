import type { Api } from '../client';
import type { components } from '../schema';
import { check } from './check';

export type ServerConfiguration = components['schemas']['ServerConfiguration'];
export type FolderStorage = components['schemas']['FolderStorageDto'];
export type SessionInfo = components['schemas']['SessionInfoDto'];
export type ActivityLogEntry = components['schemas']['ActivityLogEntry'];
export type ItemCounts = components['schemas']['ItemCounts'];

export async function fetchSystemInfo(api: Api) {
  const { data, error, response } = await api.GET('/System/Info');
  check('Reading the server information', error, response);
  return data!;
}

export async function fetchStorage(api: Api) {
  const { data, error, response } = await api.GET('/System/Info/Storage');
  check('Reading the storage information', error, response);
  return data!;
}

export async function fetchItemCounts(api: Api): Promise<ItemCounts> {
  const { data, error, response } = await api.GET('/Items/Counts');
  check('Reading the item counts', error, response);
  return data!;
}

/** Sessions active in the last 16 minutes, as the jellyfin-web dashboard. */
export async function fetchActiveSessions(api: Api): Promise<SessionInfo[]> {
  const { data, error, response } = await api.GET('/Sessions', { params: { query: { activeWithinSeconds: 960 } } });
  check('Reading the sessions', error, response);
  return data ?? [];
}

/** Recent activity: user activity (`hasUserId`) or system alerts. */
export async function fetchActivity(
  api: Api,
  opts: { hasUserId: boolean; limit: number; sinceMs: number },
): Promise<ActivityLogEntry[]> {
  const minDate = new Date(Date.now() - opts.sinceMs).toISOString();
  const { data, error, response } = await api.GET('/System/ActivityLog/Entries', {
    params: { query: { startIndex: 0, limit: opts.limit, minDate, hasUserId: opts.hasUserId } },
  });
  check('Reading the activity log', error, response);
  return data?.Items ?? [];
}

export async function restartServer(api: Api): Promise<void> {
  const { error, response } = await api.POST('/System/Restart');
  check('Restarting the server', error, response);
}

export async function shutdownServer(api: Api): Promise<void> {
  const { error, response } = await api.POST('/System/Shutdown');
  check('Shutting down the server', error, response);
}

export async function fetchConfiguration(api: Api): Promise<ServerConfiguration> {
  const { data, error, response } = await api.GET('/System/Configuration');
  check('Reading the server settings', error, response);
  return data!;
}

/**
 * Saves part of the server configuration. Reads the current configuration
 * first, so fields another page changed in the meantime are kept.
 */
export async function saveConfiguration(api: Api, patch: Partial<ServerConfiguration>): Promise<void> {
  const current = await fetchConfiguration(api);
  const { error, response } = await api.POST('/System/Configuration', { body: { ...current, ...patch } });
  check('Saving the server settings', error, response);
}

export async function fetchLocalizationOptions(api: Api) {
  const { data, error, response } = await api.GET('/Localization/Options');
  check('Reading the languages', error, response);
  return data ?? [];
}

/** A named configuration section (`/System/Configuration/{key}`), such as `xbmcmetadata`. */
export async function fetchNamedConfiguration<T>(api: Api, key: string): Promise<T> {
  const { data, error, response } = await api.GET('/System/Configuration/{key}', {
    params: { path: { key } },
  });
  check(`Reading the ${key} settings`, error, response);
  // The contract types this body as a string; the server sends the JSON object.
  return data as unknown as T;
}

export async function saveNamedConfiguration(api: Api, key: string, value: unknown): Promise<void> {
  const { error, response } = await api.POST('/System/Configuration/{key}', {
    params: { path: { key } },
    body: value,
  });
  check(`Saving the ${key} settings`, error, response);
}

/** Bytes as jellyfin-web shows them: 1.5 GB, 512 MB. */
export function readableSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n >= 100 || u === 0 ? Math.round(n) : n.toFixed(1)} ${units[u]}`;
}

/** Used and total space of a folder; null parts are unknown. */
export function folderSpace(folder?: FolderStorage | null): { used: number | null; total: number | null; percent: number } {
  if (!folder || folder.UsedSpace === undefined || folder.UsedSpace < 0) return { used: null, total: null, percent: 0 };
  const used = Math.max(0, folder.UsedSpace);
  const total = Math.max(0, folder.FreeSpace ?? 0) + used;
  return { used, total, percent: total > 0 ? Math.min(100, (used / total) * 100) : 0 };
}
