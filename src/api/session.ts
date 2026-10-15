// Session + device identity. Storage keys are versioned so a future shape
// change can migrate instead of exploding.

const DEVICE_KEY = 'deadfin.device.v1';
const SESSION_KEY = 'deadfin.session.v1';

export interface Session {
  serverUrl: string;
  accessToken: string;
  userId: string;
  userName: string;
  serverName?: string;
}

export function deviceId(storage: Storage = localStorage): string {
  let id = storage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function loadSession(storage: Storage = localStorage): Session | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    if (s.serverUrl && s.accessToken && s.userId && s.userName) return s as Session;
  } catch {
    /* corrupted — treat as signed out */
  }
  storage.removeItem(SESSION_KEY);
  return null;
}

export function saveSession(s: Session, storage: Storage = localStorage): void {
  storage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(storage: Storage = localStorage): void {
  storage.removeItem(SESSION_KEY);
}

/** Normalize what a human types into a base URL the client can use. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('Server address is required');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return new URL(url).origin + new URL(url).pathname.replace(/\/+$/, '');
}

/**
 * The server address to prefill, from where the app was loaded. Served by
 * the server itself at `<base>/web/`, the server is the origin plus `<base>`
 * (BaseUrl, e.g. `/jellyfin`). Served at a site root (a reverse proxy in
 * front of both), it is the origin. The Vite dev and preview ports have no
 * server behind them, so nothing is prefilled.
 */
export function defaultServerFor(loc: { origin: string; port: string; pathname: string }): string {
  if (loc.port === '5210' || loc.port === '5211') return '';
  const web = /^(.*?)\/web(?:\/.*)?$/i.exec(loc.pathname);
  return loc.origin + (web ? web[1] : '');
}
