import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { deviceId } from './session';
import { clientVersion, webBuild } from '../build';

export const CLIENT_NAME = 'Deadfin Web';

/**
 * The MediaBrowser authorization scheme, per the 12.0.0 contract's
 * `CustomAuthentication` security definition (and jellyfin-web's observed
 * behavior: identity fields always present, Token added once authenticated).
 */
export function authorizationHeader(opts: {
  deviceId: string;
  device?: string;
  token?: string;
}): string {
  const quote = (v: string) => `"${v.replace(/["\u0000-\u001f\u007f]/g, '')}"`;
  const parts = [
    `Client=${quote(CLIENT_NAME)}`,
    `Device=${quote(opts.device ?? 'Browser')}`,
    `DeviceId=${quote(opts.deviceId)}`,
    `Version=${quote(clientVersion(webBuild))}`,
  ];
  if (opts.token) parts.push(`Token=${quote(opts.token)}`);
  return `MediaBrowser ${parts.join(', ')}`;
}

export type Api = ReturnType<typeof createClient<paths>>;

export function createApi(serverUrl: string, token?: string): Api {
  const client = createClient<paths>({ baseUrl: serverUrl });
  client.use({
    onRequest({ request }) {
      request.headers.set(
        'Authorization',
        authorizationHeader({ deviceId: deviceId(), token }),
      );
      return request;
    },
  });
  return client;
}

/* The contract allows null for tag map values, so helpers accept the same. */
type TagMap = { [key: string]: string | null } | null | undefined;

/** Primary image URL for an item; empty string when the item has no image. */
export function primaryImageUrl(
  serverUrl: string,
  item: { Id?: string | null; ImageTags?: TagMap },
  fillWidth = 480,
): string {
  const tag = item.ImageTags?.['Primary'];
  if (!item.Id || !tag) return '';
  const q = new URLSearchParams({ fillWidth: String(fillWidth), quality: '90', tag });
  return `${serverUrl}/Items/${item.Id}/Images/Primary?${q}`;
}

/** Backdrop image URL for an item; empty string when it has none. */
export function backdropImageUrl(
  serverUrl: string,
  item: { Id?: string | null; BackdropImageTags?: string[] | null },
  fillWidth = 1920,
): string {
  const tag = item.BackdropImageTags?.[0];
  if (!item.Id || !tag) return '';
  const q = new URLSearchParams({ fillWidth: String(fillWidth), quality: '90', tag });
  return `${serverUrl}/Items/${item.Id}/Images/Backdrop?${q}`;
}

/** Blurhash for an item's primary image, when the server computed one. */
export function primaryBlurhash(item: {
  ImageTags?: TagMap;
  ImageBlurHashes?: { Primary?: { [key: string]: string | null } | null } | null;
}): string | undefined {
  const tag = item.ImageTags?.['Primary'];
  if (!tag) return undefined;
  return item.ImageBlurHashes?.Primary?.[tag] ?? undefined;
}
