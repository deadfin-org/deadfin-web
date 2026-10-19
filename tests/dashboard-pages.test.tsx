import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';

const SERVER = 'http://s';

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

const policy = (admin: boolean) => ({
  IsAdministrator: admin,
  IsDisabled: false,
  EnableAllFolders: true,
  EnabledFolders: [],
  EnableRemoteAccess: true,
  EnableMediaPlayback: true,
  AuthenticationProviderId: 'auth',
  PasswordResetProviderId: 'reset',
});

/** A small server with users, libraries and tasks that the pages change. */
function stubServer() {
  const state = {
    users: [
      { Id: 'u1', Name: 'ada', HasConfiguredPassword: true, Policy: policy(true) },
      { Id: 'u2', Name: 'bo', HasConfiguredPassword: true, Policy: policy(false), LastActivityDate: new Date().toISOString() },
    ] as { Id: string; Name: string; HasConfiguredPassword: boolean; Policy: Record<string, unknown>; LastActivityDate?: string }[],
    folders: [{ Name: 'Movies', ItemId: 'lib1', CollectionType: 'movies', Locations: ['/media/movies'], LibraryOptions: { Enabled: true } }] as {
      Name: string;
      ItemId: string;
      CollectionType?: string;
      Locations: string[];
      LibraryOptions: Record<string, unknown>;
    }[],
    tasks: [
      { Id: 't1', Name: 'Scan Media Library', Key: 'RefreshLibrary', Category: 'Library', State: 'Idle', Triggers: [{ Type: 'IntervalTrigger', IntervalTicks: 432_000_000_000 }] },
      { Id: 't2', Name: 'Clean Cache Directory', Key: 'DeleteCacheFiles', Category: 'Maintenance', State: 'Idle', Triggers: [] },
    ] as Record<string, unknown>[],
    calls: [] as { method: string; path: string; query: URLSearchParams; body: unknown }[],
  };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(r.url, SERVER);
    const text = r.method === 'GET' ? '' : await r.text();
    const body = text ? JSON.parse(text) : undefined;
    const p = url.pathname;
    state.calls.push({ method: r.method, path: p, query: url.searchParams, body });
    if (p === '/Users/Me') return json(state.users[0]);
    if (p === '/System/Info/Public') return json({ ServerName: 'Test Server', Version: '12.0.0' });
    if (p === '/UserViews') return json({ Items: [] });
    if (p === '/Users' && r.method === 'GET') return json(state.users);
    if (p === '/Users/New') {
      const u = { Id: 'u3', Name: body.Name, HasConfiguredPassword: !!body.Password, Policy: policy(false) };
      state.users.push(u);
      return json(u);
    }
    let m = /^\/Users\/(\w+)$/.exec(p);
    if (m && r.method === 'GET') return json(state.users.find((u) => u.Id === m![1]));
    if (m && r.method === 'DELETE') {
      state.users = state.users.filter((u) => u.Id !== m![1]);
      return new Response(null, { status: 204 });
    }
    m = /^\/Users\/(\w+)\/Policy$/.exec(p);
    if (m) {
      const u = state.users.find((x) => x.Id === m![1])!;
      u.Policy = body;
      return new Response(null, { status: 204 });
    }
    if (p === '/Users' && r.method === 'POST') {
      const u = state.users.find((x) => x.Id === url.searchParams.get('userId'))!;
      u.Name = body.Name;
      return new Response(null, { status: 204 });
    }
    if (p === '/Library/MediaFolders') return json({ Items: [{ Id: 'lib1', Name: 'Movies' }], TotalRecordCount: 1 });
    if (p === '/Library/VirtualFolders' && r.method === 'GET') return json(state.folders);
    if (p === '/Library/VirtualFolders' && r.method === 'POST') {
      state.folders.push({
        Name: url.searchParams.get('name')!,
        ItemId: 'lib2',
        CollectionType: url.searchParams.get('collectionType') ?? undefined,
        Locations: body.LibraryOptions.PathInfos.map((x: { Path: string }) => x.Path),
        LibraryOptions: body.LibraryOptions,
      });
      return new Response(null, { status: 204 });
    }
    if (p === '/Libraries/AvailableOptions')
      return json({ MetadataSavers: [{ Name: 'Nfo', DefaultEnabled: false }], TypeOptions: [], SubtitleFetchers: [] });
    if (p === '/Environment/DirectoryContents')
      return json(url.searchParams.get('path') === '/' ? [{ Name: 'media', Path: '/media' }] : [{ Name: 'shows', Path: '/media/shows' }]);
    if (p === '/ScheduledTasks') return json(state.tasks);
    m = /^\/ScheduledTasks\/Running\/(\w+)$/.exec(p);
    if (m) {
      const t = state.tasks.find((x) => x.Id === m![1])!;
      t.State = r.method === 'POST' ? 'Running' : 'Idle';
      t.CurrentProgressPercentage = r.method === 'POST' ? 42 : undefined;
      return new Response(null, { status: 204 });
    }
    m = /^\/ScheduledTasks\/(\w+)\/Triggers$/.exec(p);
    if (m) {
      state.tasks.find((x) => x.Id === m![1])!.Triggers = body;
      return new Response(null, { status: 204 });
    }
    m = /^\/ScheduledTasks\/(\w+)$/.exec(p);
    if (m) return json(state.tasks.find((x) => x.Id === m![1]));
    if (p === '/System/Configuration/xbmcmetadata') return json({}, 404);
    if (p === '/Localization/Cultures' || p === '/Localization/Countries' || p === '/Localization/ParentalRatings') return json([]);
    return json({}, 404);
  });
  return state;
}

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}</span>;
}

function mount(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
          <Where />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem('deadfin.session.v1', JSON.stringify({ serverUrl: SERVER, accessToken: 'tok', userId: 'u1', userName: 'ada' }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('dashboard users', () => {
  it('lists users, adds one, and opens its profile', async () => {
    const state = stubServer();
    mount('/dashboard/users');
    const cards = await screen.findAllByTestId('user-card');
    expect(cards.map((c) => within(c).getByText(/^(ada|bo)$/).textContent)).toEqual(['ada', 'bo']);
    expect(within(cards[1]!).getByText(/^Last activity/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('add-user'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'cy' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByLabelText('Enable access to all libraries'));
    fireEvent.click(screen.getByLabelText('Movies'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/users/u3/profile'));
    const u3 = state.users.find((u) => u.Id === 'u3')!;
    expect(u3.Policy).toMatchObject({ EnableAllFolders: false, EnabledFolders: ['lib1'] });
    expect(await screen.findByRole('heading', { name: 'cy', level: 1 })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Profile' }).getAttribute('aria-selected')).toBe('true');
  });

  it('saves profile policy fields and returns to the list', async () => {
    const state = stubServer();
    mount('/dashboard/users/u2/profile');
    fireEvent.click(await screen.findByLabelText('Allow this user to manage collections'));
    fireEvent.click(screen.getByLabelText('Hide this user from login screens'));
    fireEvent.change(screen.getByLabelText('Internet streaming bitrate limit (Mbps)'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/users'));
    expect(state.users[1]!.Policy).toMatchObject({
      EnableCollectionManagement: true,
      IsHidden: true,
      RemoteClientBitrateLimit: 8_000_000,
    });
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
  });

  it('deletes a user after confirmation', async () => {
    const state = stubServer();
    mount('/dashboard/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Menu for bo' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete bo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(state.users.map((u) => u.Name)).toEqual(['ada']));
    await waitFor(() => expect(screen.getAllByTestId('user-card')).toHaveLength(1));
  });

  it('password tab checks the confirmation before sending', async () => {
    const state = stubServer();
    mount('/dashboard/users/u2/password');
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('New password confirm'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Password' }));
    expect(await screen.findByText('Password and password confirmation must match.')).toBeTruthy();
    expect(state.calls.some((c) => c.path === '/Users/Password')).toBe(false);
  });
});

describe('dashboard libraries', () => {
  it('adds a library with a folder from the folder browser', async () => {
    const state = stubServer();
    mount('/dashboard/libraries');
    expect(await screen.findAllByTestId('library-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Media Library' }));
    const editor = await screen.findByRole('dialog', { name: 'Add Media Library' });
    fireEvent.change(within(editor).getByLabelText('Content type'), { target: { value: 'tvshows' } });
    expect((within(editor).getByLabelText('Display name') as HTMLInputElement).value).toBe('Shows');
    fireEvent.click(within(editor).getByRole('button', { name: 'Add folder' }));
    const picker = await screen.findByRole('dialog', { name: 'Select Path' });
    fireEvent.click(await within(picker).findByText('▸ media'));
    fireEvent.click(await within(picker).findByText('▸ shows'));
    await within(picker).findByText('/media/shows');
    fireEvent.click(within(picker).getByRole('button', { name: 'use this folder' }));
    expect(await within(editor).findByText('/media/shows')).toBeTruthy();
    expect(within(editor).getByLabelText('Special season display name')).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(state.folders.map((f) => f.Name)).toEqual(['Movies', 'Shows']));
    expect(state.folders[1]).toMatchObject({ CollectionType: 'tvshows', Locations: ['/media/shows'] });
    expect(await screen.findAllByTestId('library-card')).toHaveLength(2);
  });
});

describe('dashboard tasks', () => {
  it('groups tasks, starts one, and adds a trigger', async () => {
    const state = stubServer();
    mount('/dashboard/tasks');
    expect(await screen.findByRole('heading', { name: 'Library', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maintenance', level: 2 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Scan Media Library' }));
    expect(await screen.findByRole('progressbar', { name: 'Scan Media Library progress' })).toBeTruthy();
    expect(state.tasks[0]!.State).toBe('Running');

    fireEvent.click(screen.getByRole('link', { name: /Clean Cache Directory/ }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Trigger' }));
    const dialog = screen.getByRole('dialog', { name: 'Add Trigger' });
    fireEvent.change(within(dialog).getByLabelText('Trigger type'), { target: { value: 'IntervalTrigger' } });
    fireEvent.change(within(dialog).getByLabelText('Every'), { target: { value: String(6 * 36_000_000_000) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(state.tasks[1]!.Triggers).toEqual([{ Type: 'IntervalTrigger', IntervalTicks: 216_000_000_000 }]));
    expect(await screen.findByText('Every 6 hours')).toBeTruthy();
  });
});

describe('NFO settings', () => {
  it('says so when the server has no xbmcmetadata section', async () => {
    stubServer();
    mount('/dashboard/libraries/nfo');
    expect((await screen.findByTestId('nfo-error')).textContent).toMatch(/Failed to load metadata NFO settings/);
  });
});
