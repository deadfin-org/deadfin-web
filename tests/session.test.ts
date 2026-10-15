import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  defaultServerFor,
  deviceId,
  loadSession,
  normalizeServerUrl,
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
