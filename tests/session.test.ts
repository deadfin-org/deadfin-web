import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  defaultServerFor,
  deviceId,
  loadSession,
  normalizeServerUrl,
  randomId,
  saveSession,
  type Session,
} from '../src/api/session';

beforeEach(() => localStorage.clear());

describe('normalizeServerUrl', () => {
  it('assumes http for bare hosts', () => {
    expect(normalizeServerUrl('deadfin.local:8096')).toBe('http://deadfin.local:8096');
  });
  it('preserves https and strips trailing slashes', () => {
    expect(normalizeServerUrl('https://demo.deadfin.org/')).toBe('https://demo.deadfin.org');
  });
  it('keeps a base path (reverse-proxy subpath deployments)', () => {
    expect(normalizeServerUrl('https://host/jelly/')).toBe('https://host/jelly');
  });
  it('rejects empty input', () => {
    expect(() => normalizeServerUrl('  ')).toThrow();
  });
});

describe('session persistence', () => {
  const s: Session = {
    serverUrl: 'http://srv:8096',
    accessToken: 'tok',
    userId: 'u1',
    userName: 'whiskey',
  };

  it('round-trips a session', () => {
    saveSession(s);
    expect(loadSession()).toEqual(s);
  });

  it('treats corrupted storage as signed out and clears it', () => {
    localStorage.setItem('deadfin.session.v1', '{not json');
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem('deadfin.session.v1')).toBeNull();
  });

  it('rejects incomplete sessions', () => {
    localStorage.setItem('deadfin.session.v1', JSON.stringify({ serverUrl: 'x' }));
    expect(loadSession()).toBeNull();
  });

  it('clearSession signs out', () => {
    saveSession(s);
    clearSession();
    expect(loadSession()).toBeNull();
  });
});

describe('deviceId', () => {
  it('mints once and then sticks', () => {
    const a = deviceId();
    expect(deviceId()).toBe(a);
  });

  // crypto.randomUUID is absent outside secure contexts, such as a server
  // reached by plain HTTP on the LAN.
  it('mints without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      expect(deviceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('randomId', () => {
  it('formats a version 4 UUID from the random bytes', () => {
    const source = { getRandomValues: <T extends ArrayBufferView>(array: T) => (new Uint8Array(array.buffer).fill(0xff), array) };
    expect(randomId(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});

describe('defaultServerFor', () => {
  const at = (href: string) => {
    const u = new URL(href);
    return { origin: u.origin, port: u.port, pathname: u.pathname };
  };
  it.each([
    ['http://nas:8096/web/', 'http://nas:8096'],
    ['http://nas:8096/web/index.html', 'http://nas:8096'],
    ['http://nas:8096/web', 'http://nas:8096'],
    ['https://media.example.com/jellyfin/web/', 'https://media.example.com/jellyfin'],
    ['https://media.example.com/', 'https://media.example.com'],
    ['https://media.example.com/webapp/', 'https://media.example.com'],
    ['http://localhost:5210/', ''],
    ['http://localhost:5211/', ''],
  ])('%s → %s', (href, expected) => {
    expect(defaultServerFor(at(href))).toBe(expected);
  });
});
