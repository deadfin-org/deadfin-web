import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';
import { createApi } from '../src/api/client';
import {
  addListChannels,
  applyShareChanges,
  createChannelList,
  fetchChannelLists,
  ID_CHUNK,
  normalizeId,
  shareChanges,
  shortListName,
} from '../src/api/admin/channelLists';
import { filterChannels, listGroups } from '../src/pages/dashboard/livetv/ChannelListEdit';

const SERVER = 'http://s';

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };

/**
 * A server with an admin (u1), a user (u2) and three channel lists: p1 is
 * shared with u2, p2 with no user, p3 is public. p9 is a music playlist.
 */
function stubServer(u2Policy: Record<string, unknown>) {
  const state = {
    policy: { ...u2Policy } as Record<string, unknown>,
    shares: { p1: ['u2'], p2: [] as string[], p3: [] as string[] } as Record<string, string[]>,
    calls: [] as Call[],
  };
  const lists = [
    { Id: 'p1', Name: 'Live TV · US', Type: 'Playlist' },
    { Id: 'p2', Name: 'Live TV · Kids', Type: 'Playlist' },
    { Id: 'p3', Name: 'Live TV · News', Type: 'Playlist' },
    { Id: 'p9', Name: 'Road trip', Type: 'Playlist' },
  ];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(r.url, SERVER);
    const text = r.method === 'GET' ? '' : await r.text();
    const body = text ? JSON.parse(text) : undefined;
    const p = url.pathname;
    state.calls.push({ method: r.method, path: p, query: url.searchParams, body });
    if (p === '/Users/Me') return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: true } });
    if (p === '/System/Info/Public') return json({ ServerName: 'Test Server', Version: '12.0.0' });
    if (p === '/UserViews') return json({ Items: [] });
    if (p === '/Users' && r.method === 'GET')
      return json([
        { Id: 'u1', Name: 'ada', Policy: { IsAdministrator: true } },
        { Id: 'u2', Name: 'bo', Policy: state.policy },
      ]);
    if (p === '/Users/u2') return json({ Id: 'u2', Name: 'bo', HasConfiguredPassword: true, Policy: state.policy });
    if (p === '/Users/u2/Policy') {
      // As Deadfin: a save that omits the Deadfin field keeps the stored value.
      state.policy = { LimitLiveTvToSharedLists: state.policy.LimitLiveTvToSharedLists, ...body };
      return new Response(null, { status: 204 });
    }
    if (p === '/Users' && r.method === 'POST') return new Response(null, { status: 204 });
    if (p === '/Items' && url.searchParams.get('includeItemTypes') === 'Playlist') return json({ Items: lists, TotalRecordCount: 4 });
    let m = /^\/Playlists\/(\w+)\/Items$/.exec(p);
    if (m && r.method === 'GET') {
      const type = m[1] === 'p9' ? 'Audio' : 'TvChannel';
      return json({ Items: [{ Id: `${m[1]}-c1`, Name: 'One', Type: type }], TotalRecordCount: m[1] === 'p1' ? 1234 : 5 });
    }
    if (m) return new Response(null, { status: 204 });
    if (p === '/Items/Filters') return json({ Tags: ['Sports', 'News'] });
    if (p === '/Items' && url.searchParams.get('tags') === 'Sports')
      return json({
        Items: [
          { Id: 'p1-c1', Name: 'One', Type: 'TvChannel', Tags: ['Sports'] },
          { Id: 's2', Name: 'Two', Type: 'TvChannel', Tags: ['Sports'] },
        ],
        TotalRecordCount: 2,
      });
    m = /^\/Playlists\/(\w+)$/.exec(p);
    if (m && r.method === 'GET')
      return json({ OpenAccess: m[1] === 'p3', Shares: (state.shares[m[1]!] ?? []).map((UserId) => ({ UserId, CanEdit: false })), ItemIds: [] });
    m = /^\/Playlists\/(\w+)\/Users\/(\w+)$/.exec(p);
    if (m) {
      const cur = state.shares[m[1]!]!;
      state.shares[m[1]!] = r.method === 'POST' ? [...cur, m[2]!] : cur.filter((u) => u !== m![2]);
      return new Response(null, { status: 204 });
    }
    return json({}, 404);
  });
  return state;
}

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
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

describe('share changes', () => {
  it('shares the newly checked lists and unshares the cleared ones', () => {
    expect(shareChanges(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ share: ['c'], unshare: ['a'] });
  });

  it('changes nothing when the checks match the shares', () => {
    expect(shareChanges(new Set(['a']), new Set(['a']))).toEqual({ share: [], unshare: [] });
    expect(shareChanges(new Set(), new Set())).toEqual({ share: [], unshare: [] });
  });

  it('leaves public lists alone', () => {
    expect(shareChanges(new Set(['pub']), new Set(), new Set(['pub']))).toEqual({ share: [], unshare: [] });
    expect(shareChanges(new Set(), new Set(['pub']), new Set(['pub']))).toEqual({ share: [], unshare: [] });
  });

  it('sends a read-only share and an unshare per list', async () => {
    const state = stubServer({});
    await applyShareChanges(createApi(SERVER, 'tok'), 'u2', { share: ['p2'], unshare: ['p1'] });
    const writes = state.calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /Playlists/p2/Users/u2', 'DELETE /Playlists/p1/Users/u2']);
    expect(writes[0]!.body).toEqual({ CanEdit: false });
  });
});

describe('channel list api', () => {
  it('lists only playlists of Live TV channels, with counts', async () => {
    stubServer({});
    const lists = await fetchChannelLists(createApi(SERVER, 'tok'), 'u1');
    expect(lists.map((l) => [l.Id, l.Count])).toEqual([
      ['p1', 1234],
      ['p2', 5],
      ['p3', 5],
    ]);
  });

  it('makes a new list private', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = input instanceof Request ? input : new Request(String(input), init);
      calls.push({ url: r.url, body: JSON.parse(await r.text()) });
      return json({ Id: 'new' });
    });
    expect(await createChannelList(createApi(SERVER, 'tok'), 'u1', 'Live TV · Local')).toBe('new');
    expect(calls[0]!.body).toEqual({ Name: 'Live TV · Local', UserId: 'u1', MediaType: 'Video', IsPublic: false, Users: [] });
  });

  it('adds channels in chunks', async () => {
    const seen: URL[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = input instanceof Request ? input : new Request(String(input), init);
      seen.push(new URL(r.url));
      return new Response(null, { status: 204 });
    });
    const ids = Array.from({ length: ID_CHUNK * 2 + 5 }, (_, i) => `c${i}`);
    await addListChannels(createApi(SERVER, 'tok'), 'u1', 'p1', ids);
    expect(seen.map((u) => u.searchParams.getAll('ids').length)).toEqual([ID_CHUNK, ID_CHUNK, 5]);
    expect(seen[0]!.searchParams.get('userId')).toBe('u1');
  });

  it('names and ids', () => {
    expect(shortListName('Live TV · UK & Ireland')).toBe('UK & Ireland');
    expect(shortListName('Road trip')).toBe('Road trip');
    expect(normalizeId('EA984E71-cf9d-4abb-ac79-f93b134555e4')).toBe('ea984e71cf9d4abbac79f93b134555e4');
  });

  it('filters list channels by text, number and group', () => {
    const chs = [
      { Id: '1', EntryId: '1', Name: 'BBC One', Number: '101', Group: 'UK' },
      { Id: '2', EntryId: '2', Name: 'CNN', Number: '200', Group: 'News' },
      { Id: '3', EntryId: '3', Name: 'BBC News', Number: '102', Group: 'News' },
    ];
    expect(filterChannels(chs, 'bbc', '').map((c) => c.Id)).toEqual(['1', '3']);
    expect(filterChannels(chs, '200', '').map((c) => c.Id)).toEqual(['2']);
    expect(filterChannels(chs, 'bbc', 'News').map((c) => c.Id)).toEqual(['3']);
    expect(listGroups(chs)).toEqual([
      { name: 'News', count: 2 },
      { name: 'UK', count: 1 },
    ]);
  });
});

describe('user editor channel lists', () => {
  const base = { IsAdministrator: false, EnableLiveTvAccess: true, EnableRemoteAccess: true, AuthenticationProviderId: 'a' };

  it('shows the shared lists checked and saves the policy and share changes', async () => {
    const state = stubServer({ ...base, LimitLiveTvToSharedLists: true });
    mount('/dashboard/users/u2/profile');
    const checks = await screen.findByTestId('channel-list-checks');
    const us = (await within(checks).findByLabelText('US (1,234 channels)')) as HTMLInputElement;
    const kids = within(checks).getByLabelText('Kids (5 channels)') as HTMLInputElement;
    const news = within(checks).getByLabelText('News (5 channels, public)') as HTMLInputElement;
    expect(within(checks).queryByText(/Road trip/)).toBeNull();
    expect([us.checked, kids.checked, news.checked, news.disabled]).toEqual([true, false, true, true]);
    fireEvent.click(us);
    fireEvent.click(kids);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/users'));
    expect(state.policy.LimitLiveTvToSharedLists).toBe(true);
    const policySave = state.calls.find((c) => c.path === '/Users/u2/Policy')!;
    expect(policySave.body).toMatchObject({ LimitLiveTvToSharedLists: true, EnableLiveTvAccess: true });
    expect(state.shares).toEqual({ p1: [], p2: ['u2'], p3: [] });
  });

  it('turns the limit off and keeps the shares', async () => {
    const state = stubServer({ ...base, LimitLiveTvToSharedLists: true });
    mount('/dashboard/users/u2/profile');
    await screen.findByTestId('channel-list-checks');
    fireEvent.click(screen.getByLabelText('Show only the channels in the checked lists'));
    expect(screen.queryByTestId('channel-list-checks')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/users'));
    expect(state.policy.LimitLiveTvToSharedLists).toBe(false);
    expect(state.shares.p1).toEqual(['u2']);
    expect(state.calls.some((c) => c.path.includes('/Users/u2') && c.path.startsWith('/Playlists'))).toBe(false);
  });

  it('hides the limit when Live TV access is off', async () => {
    stubServer({ ...base, EnableLiveTvAccess: false });
    mount('/dashboard/users/u2/profile');
    await screen.findByLabelText('Allow Live TV access');
    expect(screen.queryByLabelText('Show only the channels in the checked lists')).toBeNull();
    fireEvent.click(screen.getByLabelText('Allow Live TV access'));
    expect((screen.getByLabelText('Show only the channels in the checked lists') as HTMLInputElement).checked).toBe(false);
  });
});

describe('channel lists page', () => {
  it('lists the channel lists with their shares', async () => {
    stubServer({});
    mount('/dashboard/livetv/lists');
    const rows = await screen.findAllByTestId('channel-list-row');
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Live TV · US', 'Live TV · Kids', 'Live TV · News']);
    await waitFor(() => expect(within(rows[0]!).getByText('bo')).toBeTruthy());
    expect(within(rows[1]!).getByText('Only you')).toBeTruthy();
    expect(within(rows[2]!).getByText('All users (public)')).toBeTruthy();
  });
});

describe('channel list editor', () => {
  it('removes the checked channels by entry id', async () => {
    const state = stubServer({});
    mount('/dashboard/livetv/lists/p1');
    fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove checked (1)' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove Channels' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(state.calls.some((c) => c.method === 'DELETE')).toBe(true));
    const del = state.calls.find((c) => c.method === 'DELETE')!;
    expect(del.path).toBe('/Playlists/p1/Items');
    expect(del.query.getAll('entryIds')).toEqual(['p1-c1']);
  });

  it('adds a whole group, less the channels already in the list', async () => {
    const state = stubServer({});
    mount('/dashboard/livetv/lists/p1');
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Channels' }));
    const dialog = screen.getByRole('dialog', { name: 'Add Channels' });
    await within(dialog).findByRole('option', { name: 'Sports' });
    fireEvent.change(within(dialog).getByLabelText('Group'), { target: { value: 'Sports' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add all 2 found' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Channels' })).toBeNull());
    const add = state.calls.find((c) => c.method === 'POST' && c.path === '/Playlists/p1/Items')!;
    expect(add.query.getAll('ids')).toEqual(['s2']);
  });
});
