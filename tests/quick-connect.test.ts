import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import { authorizeQuickConnect, normalizeCode } from '../src/api/quickConnect';

afterEach(() => vi.unstubAllGlobals());

/** Answers /QuickConnect/Enabled with `enabled` and /QuickConnect/Authorize with `status`/`body`. */
function stubServer(enabled: boolean, status: number, body: unknown = true) {
  const calls: Request[] = [];
  vi.stubGlobal('fetch', async (req: Request) => {
    calls.push(req);
    const json = (v: unknown, s = 200) =>
      new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
    return new URL(req.url).pathname === '/QuickConnect/Enabled' ? json(enabled) : json(body, status);
  });
  return calls;
}

describe('normalizeCode', () => {
  it('drops spaces and dashes', () => {
    expect(normalizeCode(' 123 456 ')).toBe('123456');
    expect(normalizeCode('123-456')).toBe('123456');
  });
});

describe('authorizeQuickConnect', () => {
  it('authorizes the code for the signed-in user', async () => {
    const calls = stubServer(true, 200, true);
    await authorizeQuickConnect(createApi('http://s', 'tok'), '123456', 'u1');
    const url = new URL(calls[1]!.url);
    expect(calls[1]!.method).toBe('POST');
    expect(url.pathname).toBe('/QuickConnect/Authorize');
    expect(url.searchParams.get('code')).toBe('123456');
    expect(url.searchParams.get('userId')).toBe('u1');
  });

  it('says so when Quick Connect is off', async () => {
    const calls = stubServer(false, 200);
    await expect(authorizeQuickConnect(createApi('http://s', 'tok'), '1', 'u1')).rejects.toThrow('turned off');
    expect(calls).toHaveLength(1);
  });

  it('explains an unknown or expired code', async () => {
    stubServer(true, 404, { title: 'Not Found' });
    await expect(authorizeQuickConnect(createApi('http://s', 'tok'), '1', 'u1')).rejects.toThrow(
      'No device is waiting with that code',
    );
  });
});
