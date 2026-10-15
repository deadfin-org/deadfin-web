import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../src/api/client';
import { addLibrary, completeSetup, needsSetup, parentPath, SetupGateError } from '../src/api/setup';

function stubFetch(status: number, body: unknown = {}) {
  const calls: Request[] = [];
  vi.stubGlobal('fetch', async (req: Request) => {
    calls.push(req);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('parentPath', () => {
  it.each([
    ['/media/movies', '/media'],
    ['/media/movies/', '/media'],
    ['/media', '/'],
    ['/', '/'],
    ['C:\\Media\\Films', 'C:\\Media'],
    ['C:\\Media', 'C:\\'],
    ['C:\\', 'C:\\'],
  ])('%s → %s', (path, parent) => expect(parentPath(path)).toBe(parent));
});

describe('needsSetup', () => {
  it('is true while the wizard is not complete', async () => {
    stubFetch(200, { StartupWizardCompleted: false });
    expect(await needsSetup(createApi('http://s'))).toBe(true);
  });

  it('is false once setup is done', async () => {
    stubFetch(200, { StartupWizardCompleted: true });
    expect(await needsSetup(createApi('http://s'))).toBe(false);
  });

  it('is null when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await needsSetup(createApi('http://s'))).toBeNull();
  });
});

describe('setup steps', () => {
  it("turn the first-run gate's 403 into the setup-link message", async () => {
    stubFetch(403);
    await expect(completeSetup(createApi('http://s'))).rejects.toBeInstanceOf(SetupGateError);
  });

  it('name the step and status on other failures', async () => {
    stubFetch(500);
    await expect(completeSetup(createApi('http://s'))).rejects.toThrow('Finishing setup failed (HTTP 500).');
  });

  it('add a library with its paths in the query and a scan', async () => {
    const calls = stubFetch(204);
    await addLibrary(createApi('http://s'), { name: 'Films', type: 'movies', paths: ['/media/a', '/media/b'] });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/Library/VirtualFolders');
    expect(url.searchParams.get('name')).toBe('Films');
    expect(url.searchParams.get('collectionType')).toBe('movies');
    expect(url.searchParams.getAll('paths')).toEqual(['/media/a', '/media/b']);
    expect(url.searchParams.get('refreshLibrary')).toBe('true');
  });
});
