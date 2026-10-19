import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';

const SERVER = 'http://s';
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

/** Requests the page made, as path?query. */
let seen: URL[] = [];

function stubServer() {
  seen = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), SERVER);
    seen.push(url);
    switch (url.pathname) {
      case '/Users/Me':
        return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: false } });
      case '/UserViews':
        return json({
          Items: [
            { Id: 'v1', Name: 'Films', CollectionType: 'movies', Type: 'CollectionFolder' },
            { Id: 'lt', Name: 'Live TV', CollectionType: 'livetv', Type: 'UserView' },
          ],
        });
      case '/System/Info/Public':
        return json({ ServerName: 'Test Server', Version: '12.0.0' });
      case '/Items':
        return json({
          Items: [{ Id: 'm1', Name: 'Voyage', Type: 'Movie' }],
          TotalRecordCount: 1,
        });
      case '/Genres':
        return json({ Items: [{ Id: 'g1', Name: 'Drama', Type: 'Genre' }], TotalRecordCount: 1 });
      default:
        return json({ Items: [] });
    }
  });
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

const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  localStorage.setItem('deadfin.session.v1', JSON.stringify({ serverUrl: SERVER, accessToken: 'tok', userId: 'u1', userName: 'ada' }));
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('library page', () => {
  it('shows the jellyfin-web tabs and streams the first page', async () => {
    mount('/movies?topParentId=v1&collectionType=movies');
    expect(await screen.findByRole('heading', { name: 'Films' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Movies',
      'Suggestions',
      'Favorites',
      'Collections',
      'Genres',
      'Studios',
      'Playlists',
    ]);
    expect(await screen.findByText('Voyage')).toBeTruthy();
    expect(screen.getByTestId('library-count').textContent).toBe('1 item');
    const items = seen.find((u) => u.pathname === '/Items')!;
    expect(items.searchParams.get('parentId')).toBe('v1');
    expect(items.searchParams.get('limit')).toBe('36');
    expect(items.searchParams.getAll('includeItemTypes')).toEqual(['Movie']);
  });

  it('a sort choice goes to the URL and the query; the same choice again flips the order', async () => {
    mount('/movies?topParentId=v1&collectionType=movies');
    fireEvent.click(await screen.findByRole('button', { name: /^Sort:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Date Added' }));
    await waitFor(() => expect(where()).toContain('sortBy=DateCreated%2CSortName'));
    fireEvent.click(screen.getByRole('button', { name: /^Sort:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Date Added/ }));
    await waitFor(() => expect(where()).toContain('sortOrder=Descending'));
    await waitFor(() => expect(seen.some((u) => u.searchParams.get('sortOrder') === 'Descending')).toBe(true));
  });

  it('a tab change keeps the library and clears sort and filters', async () => {
    mount('/movies?topParentId=v1&collectionType=movies&sortBy=Random&letter=B');
    fireEvent.click(await screen.findByRole('tab', { name: 'Genres' }));
    await waitFor(() => expect(where()).toBe('/movies?topParentId=v1&collectionType=movies&tab=4'));
    expect(await screen.findByText('Drama')).toBeTruthy();
  });

  it('Live TV opens on Channels with the Live TV view', async () => {
    mount('/livetv?collectionType=livetv');
    expect(await screen.findByText('Voyage')).toBeTruthy();
    const items = seen.find((u) => u.pathname === '/Items')!;
    expect(items.searchParams.get('parentId')).toBe('lt');
    expect(items.searchParams.get('recursive')).toBe('false');
  });

  it('old /library paths redirect to the jellyfin-web path, or to the list', async () => {
    mount('/library/v1');
    await waitFor(() => expect(where()).toBe('/movies?topParentId=v1&collectionType=movies'));
    cleanup();
    mount('/library/zzz');
    await waitFor(() => expect(where()).toBe('/list?parentId=zzz'));
    expect(await screen.findByText('Voyage')).toBeTruthy();
  });
});

describe('home', () => {
  it('has Home and Favorites tabs and My Media tiles', async () => {
    mount('/home');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Home', 'Favorites']);
    expect(await screen.findByTestId('my-media')).toBeTruthy();
    expect(screen.getAllByTestId('library-tile').map((t) => t.getAttribute('href'))).toEqual([
      '/movies?topParentId=v1&collectionType=movies',
      '/livetv?topParentId=lt&collectionType=livetv',
    ]);
    // Recently Added asks /Items/Latest, not livetv.
    await waitFor(() => expect(seen.some((u) => u.pathname === '/Items/Latest' && u.searchParams.get('parentId') === 'v1')).toBe(true));
    expect(seen.some((u) => u.pathname === '/Items/Latest' && u.searchParams.get('parentId') === 'lt')).toBe(false);
  });
});
