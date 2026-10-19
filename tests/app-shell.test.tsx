import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';
import { Tabs, useTabParam } from '../src/ui/Tabs';

const SERVER = 'http://s';

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

function stubServer(opts: { admin: boolean }) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), SERVER);
    void init;
    switch (url.pathname) {
      case '/Users/Me':
        return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: opts.admin } });
      case '/UserViews':
        return json({ Items: [{ Id: 'v1', Name: 'Movies', CollectionType: 'movies' }] });
      case '/System/Info/Public':
        return json({ ServerName: 'Test Server', Version: '12.0.0' });
      case '/Items':
      case '/UserItems/Resume':
      case '/Shows/NextUp':
        return json({ Items: [], TotalRecordCount: 0 });
      default:
        return json({}, 404);
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

beforeEach(() => {
  localStorage.setItem(
    'deadfin.session.v1',
    JSON.stringify({ serverUrl: SERVER, accessToken: 'tok', userId: 'u1', userName: 'ada' }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('app shell', () => {
  it('shows the app bar with server name, search and user menu on Home', async () => {
    stubServer({ admin: false });
    mount('/home');
    expect(await screen.findByText('Test Server')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'User menu: ada' })).toBeTruthy();
  });

  it('drawer lists Home, Favorites and the libraries', async () => {
    stubServer({ admin: false });
    mount('/home');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(drawer).getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(within(drawer).getByRole('link', { name: 'Favorites' }).getAttribute('href')).toBe('/home?tab=1');
    expect((await within(drawer).findByRole('link', { name: 'Movies' })).getAttribute('href')).toBe('/library/v1');
  });

  it('user menu offers Dashboard to administrators only', async () => {
    stubServer({ admin: true });
    mount('/home');
    fireEvent.click(screen.getByRole('button', { name: 'User menu: ada' }));
    const menu = screen.getByRole('menu');
    expect(await within(menu).findByRole('menuitem', { name: 'Dashboard' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Quick Connect' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
    cleanup();

    stubServer({ admin: false });
    mount('/home');
    fireEvent.click(screen.getByRole('button', { name: 'User menu: ada' }));
    await screen.findByText('Test Server');
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Dashboard' })).toBeNull();
  });

  it('dashboard opens for administrators with its drawer', async () => {
    stubServer({ admin: true });
    mount('/dashboard');
    const drawer = await screen.findByRole('navigation', { name: 'Dashboard menu' });
    expect(within(drawer).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/dashboard');
    expect(within(drawer).getByRole('link', { name: 'Live TV' }).getAttribute('href')).toBe('/dashboard/livetv');
    expect(await screen.findByTestId('dashboard-server')).toBeTruthy();
  });

  it('dashboard sends other users Home', async () => {
    stubServer({ admin: false });
    mount('/dashboard');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/home'));
  });

  it('redirects old paths', async () => {
    stubServer({ admin: false });
    mount('/item/abc?season=s1');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/details?id=abc&season=s1'));
  });

  it('the player has no app bar', async () => {
    stubServer({ admin: false });
    mount('/video?id=abc');
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });
});

function TabHost() {
  const [selected, select] = useTabParam(3);
  return (
    <>
      <Tabs labels={['Movies', 'Suggestions', 'Favorites']} label="Movies" selected={selected} onSelect={select} />
      <Where />
    </>
  );
}

describe('Tabs', () => {
  it('reads and writes ?tab= and moves with arrow keys', () => {
    render(
      <MemoryRouter initialEntries={['/movies?tab=1']}>
        <TabHost />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Suggestions');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Suggestions' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Favorites');
    expect(screen.getByTestId('where').textContent).toBe('/movies?tab=2');
    fireEvent.click(screen.getByRole('tab', { name: 'Movies' }));
    expect(screen.getByTestId('where').textContent).toBe('/movies');
  });

  it('falls back to the first tab for a bad index', () => {
    render(
      <MemoryRouter initialEntries={['/movies?tab=9']}>
        <TabHost />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Movies');
  });
});
