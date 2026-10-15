import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import { describeServer, fetchServerIdentity } from '../src/api/serverBuild';

afterEach(() => vi.unstubAllGlobals());

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

// The typed client uses the global fetch; the build probe uses the injected one.
function stubInfo(version: string) {
  vi.stubGlobal('fetch', async () => json({ Version: version, ServerName: 'box' }));
}

describe('fetchServerIdentity', () => {
  it('reports the Deadfin build when the server has one', async () => {
    stubInfo('12.0.0');
    const id = await fetchServerIdentity(createApi('http://s'), 'http://s', async () =>
      json({ Component: 'deadfin-server', Version: '0.3.0-rc.3', Revision: '2e1041ed31d8', Channel: 'rc' }),
    );
    expect(id).toEqual({ product: 'Deadfin', version: '0.3.0-rc.3', revision: '2e1041ed31d8', channel: 'rc' });
    expect(describeServer(id)).toBe('Deadfin 0.3.0-rc.3');
  });

  it('falls back to the Jellyfin version on a 404', async () => {
    stubInfo('12.0.0');
    const id = await fetchServerIdentity(createApi('http://s'), 'http://s', async () => json({}, 404));
    expect(describeServer(id)).toBe('Jellyfin 12.0.0');
  });

  it('falls back when the probe cannot be read', async () => {
    stubInfo('10.11.0');
    const id = await fetchServerIdentity(createApi('http://s'), 'http://s', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(describeServer(id)).toBe('Jellyfin 10.11.0');
  });
});
