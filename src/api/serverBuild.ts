import type { Api } from './client';

/** Which server this is, for the header and bug reports. */
export interface ServerIdentity {
  product: 'Deadfin' | 'Jellyfin';
  version: string;
  /** Deadfin only: the source revision the server was built from. */
  revision?: string;
  channel?: string;
}

interface DeadfinBuild {
  Component?: string;
  Version?: string;
  Revision?: string;
  Channel?: string;
}

/**
 * Deadfin answers the anonymous `/deadfin/v1/build` with its real version;
 * `/System/Info/Public` reports the Jellyfin version it is compatible with.
 * Anything else (stock Jellyfin's 404, an HTML page) means Jellyfin.
 */
export async function fetchServerIdentity(
  api: Api,
  serverUrl: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<ServerIdentity> {
  try {
    const res = await fetchImpl(`${serverUrl}/deadfin/v1/build`);
    if (res.ok) {
      const b = (await res.json()) as DeadfinBuild;
      if (b.Version) return { product: 'Deadfin', version: b.Version, revision: b.Revision, channel: b.Channel };
    }
  } catch {
    // Not reachable or not JSON: fall through to the Jellyfin answer.
  }
  const { data, error } = await api.GET('/System/Info/Public');
  if (error !== undefined || !data) throw new Error('System/Info/Public failed');
  return { product: 'Jellyfin', version: data.Version ?? '?' };
}

export function describeServer(id: ServerIdentity): string {
  return `${id.product} ${id.version}`;
}
