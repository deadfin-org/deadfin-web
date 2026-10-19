import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createApi } from '../src/api/client';
import { deletableIds, deleteDevices, deviceApp, deviceName, renameDevice } from '../src/api/admin/devices';
import { activityViewFromParam, activityViewParam, fetchActivityPage } from '../src/api/admin/activity';
import { fetchLogFile } from '../src/api/admin/logs';
import { DevicesTable } from '../src/pages/dashboard/Devices';
import { ActivityTable } from '../src/pages/dashboard/Activity';
import { ApiKeysTable } from '../src/pages/dashboard/ApiKeys';
import { LogsPage } from '../src/pages/dashboard/Logs';
import { LogFileView } from '../src/pages/dashboard/LogFile';

const S = 'http://s';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { method: string; url: URL; body: unknown };

/** Stubs fetch with `handle`; records every request. */
function stub(handle: (c: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const text = await request.clone().text();
    const call = { method: request.method, url: new URL(request.url), body: text ? JSON.parse(text) : undefined };
    calls.push(call);
    return handle(call) ?? json({}, 404);
  });
  return calls;
}

function mount(ui: ReactNode, path = '/') {
  function Where() {
    const l = useLocation();
    return <span data-testid="where">{l.pathname + l.search}</span>;
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const api = () => createApi(S, 'tok');

describe('devices API', () => {
  it('names, app and Delete All ids', () => {
    expect(deviceName({ Name: 'Chrome', CustomName: 'Den TV' })).toBe('Den TV');
    expect(deviceName({ Name: 'Chrome', CustomName: '' })).toBe('Chrome');
    expect(deviceApp({ AppName: 'Jellyfin Web', AppVersion: '12.0.0' })).toBe('Jellyfin Web 12.0.0');
    expect(deletableIds([{ Id: 'a' }, { Id: 'me' }, { Id: null }, { Id: 'b' }], 'me')).toEqual(['a', 'b']);
  });

  it('rename posts CustomName; an empty name clears it', async () => {
    const calls = stub(() => new Response(null, { status: 204 }));
    await renameDevice(api(), 'd1', '  Den TV ');
    await renameDevice(api(), 'd1', '   ');
    expect(calls.map((c) => [c.method, c.url.pathname, c.url.searchParams.get('id'), c.body])).toEqual([
      ['POST', '/Devices/Options', 'd1', { CustomName: 'Den TV' }],
      ['POST', '/Devices/Options', 'd1', {}],
    ]);
  });

  it('delete sends ids in batches of 50', async () => {
    const calls = stub(() => new Response(null, { status: 204 }));
    await deleteDevices(api(), Array.from({ length: 120 }, (_, i) => `d${i}`));
    expect(calls.map((c) => c.url.searchParams.getAll('id').length)).toEqual([50, 50, 20]);
    expect(calls.every((c) => c.method === 'DELETE' && c.url.pathname === '/Devices')).toBe(true);
  });
});

describe('activity API', () => {
  it('maps ?useractivity= as jellyfin-web', () => {
    expect(activityViewFromParam(null)).toBe('all');
    expect(activityViewFromParam('true')).toBe('user');
    expect(activityViewFromParam('false')).toBe('system');
    expect(activityViewParam('all')).toBeNull();
    expect(activityViewParam('user')).toBe('true');
    expect(activityViewParam('system')).toBe('false');
  });

  it('asks for one page, newest first, with hasUserId for User and System', async () => {
    const calls = stub(() => json({ Items: [{ Id: 1 }], TotalRecordCount: 9 }));
    const page = await fetchActivityPage(api(), { view: 'system', startIndex: 50, limit: 50 });
    expect(page).toEqual({ items: [{ Id: 1 }], total: 9, startIndex: 50 });
    const q = calls[0]!.url.searchParams;
    expect(calls[0]!.url.pathname).toBe('/System/ActivityLog/Entries');
    expect([q.get('startIndex'), q.get('limit'), q.get('hasUserId'), q.get('sortBy'), q.get('sortOrder')]).toEqual([
      '50',
      '50',
      'false',
      'DateCreated',
      'Descending',
    ]);
    await fetchActivityPage(api(), { view: 'all', startIndex: 0, limit: 50 });
    expect(calls[1]!.url.searchParams.has('hasUserId')).toBe(false);
  });
});

describe('logs API', () => {
  it('reads a log file as text', async () => {
    const calls = stub(() => new Response('line 1\nline 2\n', { headers: { 'Content-Type': 'text/plain' } }));
    expect(await fetchLogFile(api(), 'log_20261019.log')).toBe('line 1\nline 2\n');
    expect(calls[0]!.url.pathname).toBe('/System/Logs/Log');
    expect(calls[0]!.url.searchParams.get('name')).toBe('log_20261019.log');
  });
});

describe('Devices page', () => {
  const devices = [
    { Id: 'me', Name: 'Firefox', AppName: 'Deadfin Web', AppVersion: '0.3.0', LastUserName: 'ada', DateLastActivity: '2026-10-19T10:00:00Z' },
    { Id: 'tv', Name: 'Living Room', CustomName: 'Den TV', AppName: 'Swiftfin', LastUserName: 'bob' },
    { Id: 'ph', Name: 'Pixel', AppName: 'Findroid', LastUserName: 'ada' },
  ];

  it('lists devices; the current one cannot be deleted', async () => {
    stub((c) => (c.url.pathname === '/Devices' ? json({ Items: devices, TotalRecordCount: 3 }) : undefined));
    mount(<DevicesTable api={api()} serverUrl={S} currentDeviceId="me" />);
    expect(await screen.findAllByTestId('device-row')).toHaveLength(3);
    expect(screen.getAllByTestId('device-name').map((n) => n.textContent)).toEqual(['Firefox', 'Den TV', 'Pixel']);
    expect((screen.getByLabelText('Delete Firefox') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Delete Den TV') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renames inline with Enter', async () => {
    const calls = stub((c) => {
      if (c.url.pathname === '/Devices') return json({ Items: devices });
      if (c.url.pathname === '/Devices/Options') return new Response(null, { status: 204 });
    });
    mount(<DevicesTable api={api()} serverUrl={S} currentDeviceId="me" />);
    fireEvent.click(await screen.findByLabelText('Edit Pixel'));
    const input = screen.getByLabelText('Device');
    fireEvent.change(input, { target: { value: 'Ada phone' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/Devices/Options')).toBe(true));
    const post = calls.find((c) => c.url.pathname === '/Devices/Options')!;
    expect([post.url.searchParams.get('id'), post.body]).toEqual(['ph', { CustomName: 'Ada phone' }]);
  });

  it('Delete All asks first and keeps the current device', async () => {
    const calls = stub((c) => {
      if (c.url.pathname === '/Devices' && c.method === 'GET') return json({ Items: devices });
      if (c.url.pathname === '/Devices' && c.method === 'DELETE') return new Response(null, { status: 204 });
    });
    mount(<DevicesTable api={api()} serverUrl={S} currentDeviceId="me" />);
    await screen.findAllByTestId('device-row');
    fireEvent.click(screen.getByTestId('devices-delete-all'));
    const dialog = screen.getAllByTestId('confirm-dialog').find((d) => d.textContent?.includes('Delete All Devices'))!;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', hidden: true }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.find((c) => c.method === 'DELETE')!.url.searchParams.getAll('id')).toEqual(['tv', 'ph']);
  });
});

describe('Activity page', () => {
  it('shows entries with user names and switches to System through the URL', async () => {
    const calls = stub((c) => {
      if (c.url.pathname === '/Users') return json([{ Id: 'u1', Name: 'ada' }]);
      if (c.url.pathname === '/System/ActivityLog/Entries') {
        return json({
          Items: [
            { Id: 2, Name: 'ada is playing Alien', Type: 'VideoPlayback', Severity: 'Information', UserId: 'u1', ItemId: 'i1', Date: '2026-10-19T10:00:00Z' },
            { Id: 1, Name: 'Scan media library failed', Type: 'TaskFailed', Severity: 'Error', UserId: '00000000-0000-0000-0000-000000000000' },
          ],
          TotalRecordCount: 2,
        });
      }
    });
    mount(<ActivityTable api={api()} serverUrl={S} />, '/dashboard/activity');
    const rows = await screen.findAllByTestId('activity-row');
    expect(rows).toHaveLength(2);
    await waitFor(() => expect(within(rows[0]!).getByText('ada')).toBeTruthy());
    expect(within(rows[0]!).getByLabelText('Media details').getAttribute('href')).toBe('/details?id=i1');
    expect(screen.getByTestId('activity-count').textContent).toBe('2 entries');

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/activity?useractivity=false');
    await waitFor(() =>
      expect(calls.some((c) => c.url.searchParams.get('hasUserId') === 'false')).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'User' })).toBeNull());
  });
});

describe('API Keys page', () => {
  it('lists, creates and revokes', async () => {
    let keys = [{ Id: 1, AccessToken: 'abc123', AppName: 'Sonarr', DateCreated: '2026-01-02T03:04:05Z' }];
    const calls = stub((c) => {
      if (c.url.pathname === '/Auth/Keys' && c.method === 'GET') return json({ Items: keys, TotalRecordCount: keys.length });
      if (c.url.pathname === '/Auth/Keys' && c.method === 'POST') {
        keys = [...keys, { Id: 2, AccessToken: 'def456', AppName: c.url.searchParams.get('app')!, DateCreated: '2026-10-19T00:00:00Z' }];
        return new Response(null, { status: 204 });
      }
      if (c.url.pathname.startsWith('/Auth/Keys/') && c.method === 'DELETE') {
        keys = keys.filter((k) => k.AccessToken !== c.url.pathname.split('/').pop());
        return new Response(null, { status: 204 });
      }
    });
    mount(<ApiKeysTable api={api()} serverUrl={S} />);
    expect(await screen.findByText('abc123')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New API Key' }));
    const input = within(screen.getByTestId('input-dialog')).getByLabelText('App name');
    fireEvent.change(input, { target: { value: 'Radarr' } });
    fireEvent.click(within(screen.getByTestId('input-dialog')).getByRole('button', { name: 'Create', hidden: true }));
    expect(await screen.findByText('def456')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.url.searchParams.get('app')).toBe('Radarr');

    fireEvent.click(screen.getByLabelText('Revoke Sonarr'));
    fireEvent.click(within(screen.getByTestId('confirm-dialog')).getByRole('button', { name: 'Delete', hidden: true }));
    await waitFor(() => expect(screen.queryByText('abc123')).toBeNull());
    expect(calls.find((c) => c.method === 'DELETE')!.url.pathname).toBe('/Auth/Keys/abc123');
  });
});

describe('Logs pages', () => {
  it('lists log files as links and saves the slow-response settings', async () => {
    const config = { ServerName: 'x', EnableSlowResponseWarning: true, SlowResponseThresholdMs: 500 };
    const calls = stub((c) => {
      if (c.url.pathname === '/System/Logs') return json([{ Name: 'log_20261019.log', DateModified: '2026-10-19T10:00:00Z', Size: 10 }]);
      if (c.url.pathname === '/System/Configuration' && c.method === 'GET') return json(config);
      if (c.url.pathname === '/System/Configuration' && c.method === 'POST') return new Response(null, { status: 204 });
    });
    mount(<LogsPage api={api()} serverUrl={S} />);
    const link = await screen.findByRole('link', { name: /log_20261019\.log/ });
    expect(link.getAttribute('href')).toBe('/dashboard/logs/log_20261019.log');

    const ms = await screen.findByLabelText('Time in ms after which a response is considered slow');
    fireEvent.change(ms, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ ...config, SlowResponseThresholdMs: 750 });
  });

  it('shows a log file with Copy, Download and Watch', async () => {
    window.scrollTo = () => {};
    stub((c) =>
      c.url.pathname === '/System/Logs/Log'
        ? new Response('[INF] started\n', { headers: { 'Content-Type': 'text/plain' } })
        : undefined,
    );
    mount(<LogFileView api={api()} serverUrl={S} name="log_20261019.log" />);
    expect((await screen.findByTestId('log-text')).textContent).toBe('[INF] started\n');
    expect(screen.getByRole('heading', { name: 'log_20261019.log' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Watch' })[0]!);
    expect(screen.getAllByRole('button', { name: 'Unwatch' })).toHaveLength(2);
  });

  it('a missing log file shows the jellyfin-web message and Retry', async () => {
    stub(() => json({ title: 'Not Found' }, 404));
    mount(<LogFileView api={api()} serverUrl={S} name="gone.log" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Failed to load the log file.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('dashboard registration', () => {
  it('the drawer lists Devices, Activity, API Keys and Logs, and the routes load', async () => {
    const { AuthProvider } = await import('../src/api/AuthContext');
    const { App } = await import('../src/App');
    localStorage.setItem('deadfin.session.v1', JSON.stringify({ serverUrl: S, accessToken: 'tok', userId: 'u1', userName: 'ada' }));
    stub((c) => {
      if (c.url.pathname === '/Users/Me') return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: true } });
      if (c.url.pathname === '/System/Logs') return json([]);
      if (c.url.pathname === '/System/Configuration') return json({});
      if (c.url.pathname === '/System/Info/Public') return json({ ServerName: 'S', Version: '12.0.0' });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard/logs']}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Logs', level: 1 })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Dashboard menu' });
    const devices = within(nav).getByRole('list', { name: 'Devices' });
    expect(within(devices).getAllByRole('link').map((a) => a.textContent)).toEqual(['Devices', 'Activity']);
    const advanced = within(nav).getByRole('list', { name: 'Advanced' });
    expect(within(advanced).getAllByRole('link').map((a) => a.textContent)).toEqual(expect.arrayContaining(['API Keys', 'Logs']));
    localStorage.clear();
  });
});
