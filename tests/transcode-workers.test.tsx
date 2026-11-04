import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';
import { createApi } from '../src/api/client';
import {
  createJoinToken,
  fetchWorkers,
  parseFingerprints,
  parsePools,
  validFingerprint,
  workerCommand,
} from '../src/api/admin/transcodeWorkers';

const SERVER = 'http://s';
const W = '/deadfin/v1/transcode-workers';
const FP = 'A'.repeat(43);

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { method: string; path: string; body: unknown };

const WORKERS = [
  {
    Id: 'w1',
    Name: 'gpu-1',
    JoinTokenId: 'j1',
    InputMode: 'stream',
    Pools: ['nvenc'],
    Connected: true,
    Created: '2026-11-01T10:00:00Z',
    LastSeen: '2026-11-03T10:00:00Z',
    Capabilities: { HwAccels: ['cuda'], Encoders: ['h264_nvenc'], FfmpegVersion: '7.1', MaxJobs: 3 },
    ActiveJobs: 2,
  },
  {
    Id: 'w2',
    Name: 'old',
    JoinTokenId: 'j1',
    InputMode: 'auto',
    Pools: [],
    Connected: false,
    Created: '2026-10-01T10:00:00Z',
    LastSeen: '2026-10-02T10:00:00Z',
    ActiveJobs: 0,
  },
  { Id: 'static-abc-cpu', Name: 'cpu', Static: true, JoinTokenId: '', InputMode: 'auto', Pools: null, Connected: true, Created: '0001-01-01T00:00:00Z', LastSeen: '2026-11-03T10:00:00Z', Capabilities: { HwAccels: [], Encoders: [], FfmpegVersion: '7.1', MaxJobs: 1 }, ActiveJobs: 0 },
];

const POLICY = {
  Mode: 'local',
  DefaultPools: [],
  LocalLimit: 0,
  QueueTimeoutSeconds: null,
  CpuFallback: null,
  Strategy: 'pack',
  Rules: [],
  WarmSlots: {},
};

/** A Deadfin server with transcode workers. `encoding` is the encoding configuration. */
function stubServer(opts: { encoding?: Record<string, unknown>; policyError?: string; plainHttp?: boolean; env?: boolean } = {}) {
  const state = {
    calls: [] as Call[],
    tokens: [] as Record<string, unknown>[],
    encoding: { EncodingThreadCount: -1, ...opts.encoding } as Record<string, unknown>,
  };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(r.url, SERVER);
    const text = r.method === 'GET' ? '' : await r.text();
    const body = text ? JSON.parse(text) : undefined;
    const p = url.pathname;
    state.calls.push({ method: r.method, path: p, body });
    if (p === '/Users/Me') return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: true } });
    if (p === '/System/Info/Public') return json({ ServerName: 'Test Server', Version: '12.0.0' });
    if (p === '/UserViews') return json({ Items: [] });
    if (p === '/System/Configuration/encoding') {
      if (r.method === 'GET') return json(state.encoding);
      state.encoding = body;
      return new Response(null, { status: 204 });
    }
    if (p === `${W}/plain-http`) {
      if (opts.plainHttp === undefined) return new Response('404 page not found', { status: 404 });
      const configured = state.encoding.AllowPlainHttpTranscodeWorkers === true;
      return json({ AllowPlainHttp: opts.env || configured, Configured: configured, SetByEnvironment: !!opts.env });
    }
    if (p === W) return json(WORKERS);
    if (p === `${W}/join-tokens` && r.method === 'GET') return json(state.tokens);
    if (p === `${W}/join-tokens`) {
      const row = { Id: 'j2', Name: body.Name, Fingerprint: body.Fingerprint ?? '', Created: '2026-11-03T10:00:00Z', Usable: true, UsesLeft: body.Uses };
      state.tokens.push(row);
      return json({ ...row, Token: 'dfw1.j2.secret.' });
    }
    if (p === `${W}/pins` && r.method === 'GET') return json({ Fingerprints: [] });
    if (p === `${W}/policy` && r.method === 'GET') return json(POLICY);
    if (p === `${W}/policy`) {
      if (opts.policyError) return json({ title: 'Bad Request', status: 400, detail: opts.policyError }, 400);
      return json({ ...body, Warnings: ['pool "gpu" has no worker'] });
    }
    if (p === `${W}/scaling-token` && r.method === 'POST') return json({ Token: 'dfs1.scale' });
    if (p.startsWith(`${W}/`)) return new Response(null, { status: 204 });
    return json({}, 404);
  });
  return state;
}

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function mount(path = '/dashboard/playback/workers') {
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

describe('transcode worker helpers', () => {
  it('parses pools and fingerprints', () => {
    expect(parsePools(' NVENC, qsv  nvenc,,')).toEqual(['nvenc', 'qsv']);
    expect(parseFingerprints(`${FP}\n ${FP}, b`)).toEqual([FP, 'b']);
    expect(validFingerprint(FP)).toBe(true);
    expect(validFingerprint('A'.repeat(42))).toBe(false);
    expect(validFingerprint(`${'A'.repeat(42)}=`)).toBe(false);
  });

  it('adds -insecure only for plain http off loopback', () => {
    expect(workerCommand('https://deadfin.example')).toBe(
      'deadfin worker -server https://deadfin.example -state-dir /var/lib/deadfin-worker -token-file /etc/deadfin/worker.token',
    );
    expect(workerCommand('http://10.0.0.5:8096')).toMatch(/ -insecure$/);
    expect(workerCommand('http://127.0.0.1:8096')).not.toMatch(/insecure/);
    expect(workerCommand('http://localhost:8096')).not.toMatch(/insecure/);
  });

  it('sends the native calls with the session token', async () => {
    const seen: Request[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = input instanceof Request ? input : new Request(String(input), init);
      seen.push(r);
      return r.method === 'GET' ? json(WORKERS) : json({ Id: 'j', Token: 't' });
    });
    const api = createApi(SERVER, 'tok');
    expect((await fetchWorkers(api)).map((w) => w.Id)).toEqual(['w1', 'w2', 'static-abc-cpu']);
    await createJoinToken(api, { Name: 'fleet', Uses: 3 });
    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([`GET ${W}`, `POST ${W}/join-tokens`]);
    expect(seen[0]!.headers.get('Authorization')).toContain('Token="tok"');
  });

  it('shows the server problem detail', async () => {
    vi.stubGlobal('fetch', async () => json({ title: 'Bad Request', status: 400, detail: 'Fingerprint is not valid' }, 400));
    await expect(createJoinToken(createApi(SERVER, 'tok'), { Name: 'x' })).rejects.toThrow(
      'Creating the join token failed: Fingerprint is not valid',
    );
  });

  it('names a server without workers', async () => {
    vi.stubGlobal('fetch', async () => new Response('404 page not found', { status: 404 }));
    await expect(fetchWorkers(createApi(SERVER, 'tok'))).rejects.toThrow('this server has no transcode workers');
  });
});

describe('transcode workers page', () => {
  it('is in the Playback drawer group and lists the workers', async () => {
    stubServer();
    mount();
    const rows = await screen.findAllByTestId('worker-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Connected')).toBeTruthy();
    expect(within(rows[0]!).getByText('2 / 3')).toBeTruthy();
    expect(within(rows[0]!).getByText('nvenc')).toBeTruthy();
    expect(within(rows[0]!).getByText('cuda · ffmpeg 7.1')).toBeTruthy();
    expect(within(rows[1]!).getByText('Offline')).toBeTruthy();
    // A static worker has no stored identity: no edit, no revoke.
    expect(within(rows[2]!).getByText('static')).toBeTruthy();
    expect((within(rows[2]!).getByRole('button', { name: 'Edit cpu' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rows[2]!).getByRole('button', { name: 'Revoke cpu' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Transcode Workers' })).toBeTruthy();
  });

  it('edits a worker', async () => {
    const state = stubServer();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit gpu-1' }));
    const dialog = await screen.findByTestId('edit-worker');
    fireEvent.change(within(dialog).getByLabelText('Pools'), { target: { value: 'nvenc, QSV' } });
    fireEvent.change(within(dialog).getByLabelText('Media input'), { target: { value: 'shared' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTestId('edit-worker')).toBeNull());
    const post = state.calls.find((c) => c.method === 'POST' && c.path === `${W}/w1`);
    expect(post!.body).toEqual({ Name: 'gpu-1', InputMode: 'shared', Pools: ['nvenc', 'qsv'] });
  });

  it('revokes a worker', async () => {
    const state = stubServer();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke old' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(state.calls.some((c) => c.method === 'DELETE' && c.path === `${W}/w2`)).toBe(true));
  });

  it('creates a join token and shows it once with the worker command', async () => {
    const state = stubServer();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /New Join Token/ }));
    const dialog = await screen.findByTestId('new-join-token');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'gpu-nodes' } });
    fireEvent.change(within(dialog).getByLabelText('Uses'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByLabelText('Expires after'), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect((await screen.findByTestId('created-token-value')).textContent).toBe('dfw1.j2.secret.');
    expect(screen.getByTestId('worker-command').textContent).toBe(
      'deadfin worker -server http://s -state-dir /var/lib/deadfin-worker -token-file /etc/deadfin/worker.token -insecure',
    );
    const post = state.calls.find((c) => c.method === 'POST' && c.path === `${W}/join-tokens`);
    expect(post!.body).toEqual({ Name: 'gpu-nodes' });
    const row = await screen.findByTestId('join-token-row');
    expect(within(row).getByText('Unlimited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('dfw1.j2.secret.')).toBeNull();
  });

  it('refuses a malformed fingerprint before the request', async () => {
    const state = stubServer();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /New Join Token/ }));
    const dialog = await screen.findByTestId('new-join-token');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'pinned' } });
    fireEvent.change(within(dialog).getByLabelText('Server key fingerprint (optional)'), { target: { value: 'short' } });
    expect(within(dialog).getByRole('alert').textContent).toMatch(/43 characters/);
    expect((within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.calls.some((c) => c.method === 'POST' && c.path === `${W}/join-tokens`)).toBe(false);
  });

  it('saves the placement policy and shows its warnings', async () => {
    const state = stubServer();
    mount();
    const form = await screen.findByTestId('placement-form');
    fireEvent.change(within(form).getByLabelText('Placement mode'), { target: { value: 'workers-only' } });
    fireEvent.change(within(form).getByLabelText('Default pools'), { target: { value: 'gpu' } });
    fireEvent.change(within(form).getByLabelText('Queue timeout (seconds)'), { target: { value: '30' } });
    fireEvent.change(within(form).getByLabelText('Warm slots (JSON)'), { target: { value: '{"gpu": 2}' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect((await screen.findByTestId('policy-warnings')).textContent).toContain('pool "gpu" has no worker');
    const put = state.calls.find((c) => c.method === 'PUT' && c.path === `${W}/policy`);
    expect(put!.body).toEqual({ ...POLICY, Mode: 'workers-only', DefaultPools: ['gpu'], QueueTimeoutSeconds: 30, WarmSlots: { gpu: 2 } });
  });

  it('shows a policy the server refuses', async () => {
    stubServer({ policyError: 'rule 1: unknown HDR "hdr11"' });
    mount();
    const form = await screen.findByTestId('placement-form');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect((await within(form).findByRole('alert')).textContent).toContain('unknown HDR "hdr11"');
  });

  it('refuses invalid rules JSON without a request', async () => {
    const state = stubServer();
    mount();
    const form = await screen.findByTestId('placement-form');
    fireEvent.change(within(form).getByLabelText('Rules (JSON)'), { target: { value: '[{' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Rules is not valid JSON.');
    expect(state.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('names the environment variable until the server has the plain-HTTP field', async () => {
    stubServer();
    mount();
    const section = await screen.findByTestId('plain-http');
    await within(section).findByText('DEADFIN_TRANSCODE_WORKERS_ALLOW_HTTP=true');
    expect(within(section).queryByRole('checkbox')).toBeNull();
  });

  it('toggles plain HTTP through the encoding configuration (deadfin#664)', async () => {
    const state = stubServer({ plainHttp: true });
    mount();
    const section = await screen.findByTestId('plain-http');
    const box = (await within(section).findByLabelText('Allow workers to connect over plain HTTP')) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(state.encoding.AllowPlainHttpTranscodeWorkers).toBe(true));
    expect(state.encoding.EncodingThreadCount).toBe(-1);
    await within(section).findByText(/media and segments cross the network unencrypted/);
    await waitFor(() => expect((within(section).getByLabelText('Allow workers to connect over plain HTTP') as HTMLInputElement).checked).toBe(true));
  });

  it('shows the environment variable that wins over the toggle', async () => {
    stubServer({ plainHttp: true, env: true });
    mount();
    const section = await screen.findByTestId('plain-http');
    const box = (await within(section).findByLabelText('Allow workers to connect over plain HTTP')) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(within(section).getByText('DEADFIN_TRANSCODE_WORKERS_ALLOW_HTTP')).toBeTruthy();
  });

  it('shows a new scaling token once', async () => {
    stubServer();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'New Scaling Token' }));
    expect((await screen.findByTestId('scaling-token-value')).textContent).toBe('dfs1.scale');
  });

  it('saves the extra pins', async () => {
    const state = stubServer();
    mount();
    const form = await screen.findByTestId('pins-form');
    fireEvent.change(within(form).getByLabelText('Fingerprints'), { target: { value: `${FP}\n` } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.calls.find((c) => c.method === 'PUT' && c.path === `${W}/pins`)?.body).toEqual({ Fingerprints: [FP] }));
  });
});
