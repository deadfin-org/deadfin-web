import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';
import { encodePublishedServerUris, getPublishedServerUris } from '../src/pages/dashboard/Networking';
import { tunerBody, tunerForm } from '../src/pages/dashboard/livetv/TunerEdit';
import { fromMbps, toMbps } from '../src/pages/dashboard/playback/Streaming';
import { parseWidths } from '../src/pages/dashboard/playback/Trickplay';

const SERVER = 'http://s';

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

type Posted = { path: string; search: string; body: unknown };

const TUNER = {
  Id: 't1',
  Type: 'm3u',
  Url: 'https://panel.example/get.php?username=u&password=p',
  FriendlyName: 'IPTV',
  TunerCount: 5,
  FallbackMaxStreamingBitrate: 30_000_000,
  AllowStreamSharing: true,
  IgnoreDts: true,
  SkipVodEntries: true,
  ExcludeGroups: ['Sports'],
  StreamOpenIntervalMs: 500,
};

/** A fake server: GETs answer from `config`; POSTs are recorded and stored. */
function stubServer(config: Record<string, unknown>) {
  const posted: Posted[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url, SERVER);
    if (request.method === 'POST' || request.method === 'DELETE') {
      const text = await request.text();
      const body = text ? JSON.parse(text) : null;
      posted.push({ path: `${request.method} ${url.pathname}`, search: url.search, body });
      if (url.pathname.startsWith('/System/Configuration')) {
        config[url.pathname] = body;
        return new Response(null, { status: 204 });
      }
      return json(body ?? {});
    }
    switch (url.pathname) {
      case '/Users/Me':
        return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: true } });
      case '/System/Info/Public':
        return json({ ServerName: 'Test Server', Version: '12.0.0' });
      case '/UserViews':
        return json({ Items: [] });
      case '/LiveTv/TunerHosts/Types':
        return json([{ Id: 'm3u', Name: 'M3U Tuner' }]);
      case '/ScheduledTasks':
        return json([{ Id: 'rg', Key: 'RefreshGuide', State: 'Idle' }]);
      case '/deadfin/v1/livetv/tunerhosts/t1/groups':
        return json({ Groups: [{ Name: 'News', Count: 9 }, { Name: 'Sports', Count: 2 }], Loaded: true });
      default:
        if (url.pathname in config) return json(config[url.pathname]);
        return json({}, 404);
    }
  });
  return posted;
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

describe('dashboard drawer', () => {
  it('lists the playback, networking and Live TV pages', async () => {
    stubServer({ '/System/Configuration/livetv': { TunerHosts: [] } });
    mount('/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Dashboard menu' });
    for (const name of ['Transcoding', 'Resume', 'Streaming', 'Trickplay', 'Live TV', 'Networking']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
  });
});

describe('transcoding', () => {
  it('shows the decoders of the chosen acceleration and saves the stored options with the changes', async () => {
    const posted = stubServer({
      '/System/Configuration/encoding': {
        HardwareAccelerationType: 'none',
        HardwareDecodingCodecs: ['h264'],
        EncodingThreadCount: -1,
        DownMixAudioBoost: 2,
        SubtitleExtractionTimeoutMinutes: 30,
      },
    });
    mount('/dashboard/playback/transcoding');
    const hwa = (await screen.findByLabelText('Hardware acceleration')) as HTMLSelectElement;
    expect(screen.queryByTestId('hw-decoding')).toBeNull();
    fireEvent.change(hwa, { target: { value: 'qsv' } });
    const decoding = screen.getByTestId('hw-decoding');
    expect(within(decoding).getByLabelText('VC1')).toBeTruthy();
    expect(within(decoding).queryByLabelText('MPEG1')).toBeNull();
    expect((within(decoding).getByLabelText('H264') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(decoding).getByLabelText('HEVC'));
    fireEvent.change(screen.getByLabelText('Transcoding thread count'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(posted).toEqual([
      {
        path: 'POST /System/Configuration/encoding',
        search: '',
        body: {
          HardwareAccelerationType: 'qsv',
          HardwareDecodingCodecs: ['h264', 'hevc'],
          EncodingThreadCount: 4,
          DownMixAudioBoost: 2,
          SubtitleExtractionTimeoutMinutes: 30,
        },
      },
    ]);
  });
});

describe('resume, streaming, trickplay', () => {
  const server = () => ({
    '/System/Configuration': {
      ServerName: 'x',
      MinResumePct: 5,
      MaxResumePct: 90,
      MinAudiobookResume: 5,
      MaxAudiobookResume: 5,
      MinResumeDurationSeconds: 300,
      RemoteClientBitrateLimit: 0,
      TrickplayOptions: { Interval: 10000, WidthResolutions: [320], TileWidth: 10, TileHeight: 10, JpegQuality: 90, Qscale: 4, ProcessThreads: 1 },
    },
  });

  it('resume writes its fields into the stored server configuration', async () => {
    const posted = stubServer(server());
    mount('/dashboard/playback/resume');
    fireEvent.change(await screen.findByLabelText('Maximum resume percentage'), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect(posted[0]!.body).toMatchObject({ ServerName: 'x', MaxResumePct: 95, MinResumePct: 5 });
  });

  it('streaming saves Mbps as bits per second', async () => {
    const posted = stubServer(server());
    mount('/dashboard/playback/streaming');
    const box = (await screen.findByLabelText('Internet streaming bitrate limit (Mbps)')) as HTMLInputElement;
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect(posted[0]!.body).toMatchObject({ RemoteClientBitrateLimit: 12_500_000 });
  });

  it('trickplay saves the widths list and keeps other options', async () => {
    const posted = stubServer(server());
    mount('/dashboard/playback/trickplay');
    const widths = (await screen.findByLabelText('Width Resolutions')) as HTMLInputElement;
    expect(widths.value).toBe('320');
    fireEvent.change(widths, { target: { value: '320, 640' } });
    fireEvent.click(screen.getByLabelText('Only generate images from key frames'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect((posted[0]!.body as { TrickplayOptions: unknown }).TrickplayOptions).toEqual({
      Interval: 10000,
      WidthResolutions: [320, 640],
      TileWidth: 10,
      TileHeight: 10,
      JpegQuality: 90,
      Qscale: 4,
      ProcessThreads: 1,
      EnableKeyFrameOnlyExtraction: true,
    });
  });

  it('converts and parses', () => {
    expect(toMbps(0)).toBeNull();
    expect(toMbps(2_500_000)).toBe(2.5);
    expect(fromMbps(null)).toBe(0);
    expect(fromMbps(0.25)).toBe(250_000);
    expect(parseWidths('320, 640,,x, -1')).toEqual([320, 640]);
  });
});

describe('networking', () => {
  it('reads and writes published server URIs as jellyfin-web', () => {
    expect(getPublishedServerUris(['https://a'])).toEqual({ all: 'https://a' });
    expect(getPublishedServerUris(['internal=http://i', 'external=https://e'])).toEqual({ internal: 'http://i', external: 'https://e' });
    expect(encodePublishedServerUris({ all: 'https://a', internal: 'x' })).toEqual(['all=https://a']);
    expect(encodePublishedServerUris({ internal: 'http://i' })).toEqual(['internal=http://i']);
  });

  it('saves lists from comma-separated text and keeps fields it does not show', async () => {
    const posted = stubServer({
      '/System/Configuration/network': {
        InternalHttpPort: 8096,
        InternalHttpsPort: 8920,
        PublicHttpPort: 8096,
        PublicHttpsPort: 8920,
        KnownProxies: [],
        PublishedServerUriBySubnet: ['192.168.1.0/24=http://lan'],
        VirtualInterfaceNames: ['veth'],
      },
    });
    mount('/dashboard/networking');
    fireEvent.change(await screen.findByLabelText('Known proxies'), { target: { value: '10.0.0.1, proxy.lan,' } });
    fireEvent.change(screen.getByLabelText('Local HTTP port number'), { target: { value: '8097' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved.');
    expect(posted[0]!.body).toEqual({
      InternalHttpPort: 8097,
      InternalHttpsPort: 8920,
      PublicHttpPort: 8096,
      PublicHttpsPort: 8920,
      KnownProxies: ['10.0.0.1', 'proxy.lan'],
      PublishedServerUriBySubnet: ['192.168.1.0/24=http://lan'],
      VirtualInterfaceNames: ['veth'],
    });
  });
});

describe('live tv', () => {
  const livetv = () => ({
    '/deadfin/v1/build': { Component: 'server', Version: '0.3.0' },
    '/System/Configuration/livetv': {
      TunerHosts: [TUNER],
      ListingProviders: [{ Id: 'p1', Type: 'xmltv', Path: 'https://panel.example/xmltv.php?password=p', EnableAllTuners: true }],
    },
  });

  it('lists tuners without playlist credentials, and guide providers', async () => {
    stubServer(livetv());
    mount('/dashboard/livetv');
    const card = await screen.findByTestId('tuner-card');
    expect(within(card).getByRole('link', { name: 'IPTV' }).getAttribute('href')).toBe('/dashboard/livetv/tuner?id=t1');
    expect(card.textContent).toContain('https://panel.example/get.php?…');
    expect(card.textContent).not.toContain('password');
    expect(card.textContent).toContain('1 groups excluded');
    const provider = screen.getByTestId('provider-item');
    expect(within(provider).getByRole('link', { name: 'XMLTV' }).getAttribute('href')).toBe('/dashboard/livetv/guide?type=xmltv&id=p1');
    expect(screen.getByRole('button', { name: /Refresh Guide Data/ })).toBeTruthy();
  });

  it('Refresh Guide Data starts the RefreshGuide task', async () => {
    const posted = stubServer(livetv());
    mount('/dashboard/livetv');
    const button = await screen.findByRole('button', { name: /Refresh Guide Data/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(posted.map((p) => p.path)).toEqual(['POST /ScheduledTasks/Running/rg']));
  });

  it('deletes a tuner after a confirm', async () => {
    const posted = stubServer(livetv());
    mount('/dashboard/livetv');
    const card = await screen.findByTestId('tuner-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    const ask = within(card).getByRole('group', { name: 'Are you sure you wish to delete this device?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(posted[0]).toEqual({ path: 'DELETE /LiveTv/TunerHosts', search: '?id=t1', body: null }));
  });

  it('the old /admin/livetv path lands on the Live TV page', async () => {
    stubServer(livetv());
    mount('/admin/livetv');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/livetv'));
  });

  it('edits an M3U tuner with its group filter and keeps Deadfin fields', async () => {
    const posted = stubServer(livetv());
    mount('/dashboard/livetv/tuner?id=t1');
    const form = await screen.findByTestId('tuner-form');
    expect((within(form).getByLabelText('Tuner type') as HTMLSelectElement).disabled).toBe(true);
    expect((within(form).getByLabelText('File or URL') as HTMLInputElement).value).toBe(TUNER.Url);
    expect((within(form).getByLabelText('Stream open interval (ms)') as HTMLInputElement).value).toBe('500');
    expect((within(form).getByLabelText('Skip VOD entries') as HTMLInputElement).checked).toBe(true);
    expect((await screen.findByTestId('kept-count')).textContent).toBe('Keeps 9 of 11 channels.');
    expect((screen.getByLabelText(/Sports/) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByLabelText('Only checked groups'));
    fireEvent.click(screen.getByLabelText(/News/));
    fireEvent.click(screen.getByLabelText(/Sports/));
    expect(screen.getByTestId('kept-count').textContent).toBe('Keeps 9 of 11 channels.');
    fireEvent.change(within(form).getByLabelText('Friendly name'), { target: { value: 'IPTV main' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard/livetv'));
    expect(posted[0]!.path).toBe('POST /LiveTv/TunerHosts');
    expect(posted[0]!.body).toEqual({
      ...TUNER,
      FriendlyName: 'IPTV main',
      UserAgent: null,
      DeviceId: null,
      ImportFavoritesOnly: false,
      AllowHWTranscoding: false,
      AllowFmp4TranscodingContainer: false,
      EnableStreamLooping: false,
      ReadAtNativeFramerate: true,
      IncludeGroups: ['News'],
      ExcludeGroups: [],
    });
  });

  it('a new tuner offers the server types and Detect My Devices', async () => {
    stubServer(livetv());
    mount('/dashboard/livetv/tuner');
    const form = await screen.findByTestId('tuner-form');
    const type = within(form).getByLabelText('Tuner type') as HTMLSelectElement;
    expect([...type.options].map((o) => o.textContent)).toEqual(['M3U Tuner', 'Other']);
    expect(within(form).getByRole('button', { name: 'Detect My Devices' })).toBeTruthy();
    expect(within(form).queryByTestId('tuner-groups')).toBeNull();
    expect(await within(form).findByLabelText('Skip VOD entries')).toBeTruthy();
  });

  it('hides the Deadfin fields on stock Jellyfin', async () => {
    const config = livetv() as Record<string, unknown>;
    delete config['/deadfin/v1/build'];
    stubServer(config);
    mount('/dashboard/livetv/tuner?id=t1');
    const form = await screen.findByTestId('tuner-form');
    await waitFor(() => expect(within(form).getByLabelText('File or URL')).toBeTruthy());
    expect(within(form).queryByLabelText('Skip VOD entries')).toBeNull();
    expect(within(form).queryByTestId('tuner-groups')).toBeNull();
  });

  it('saves an XMLTV provider with its categories, validating the listings', async () => {
    const posted = stubServer(livetv());
    mount('/dashboard/livetv/guide?type=xmltv&id=p1');
    const form = await screen.findByTestId('xmltv-form');
    fireEvent.change(within(form).getByLabelText('Movie categories'), { target: { value: 'movie|film' } });
    fireEvent.click(within(form).getByLabelText('Enable for all tuner devices'));
    fireEvent.click(within(form).getByLabelText(/IPTV/));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.path).toBe('POST /LiveTv/ListingProviders');
    expect(posted[0]!.search).toBe('?validateListings=true');
    expect(posted[0]!.body).toMatchObject({
      Id: 'p1',
      Type: 'xmltv',
      MovieCategories: ['movie', 'film'],
      EnableAllTuners: false,
      EnabledTuners: ['t1'],
    });
  });
});

describe('tuner form', () => {
  it('new tuners start with jellyfin-web defaults', () => {
    const f = tunerForm(undefined, 'm3u');
    expect(f).toMatchObject({ Type: 'm3u', FallbackMbps: 30, AllowStreamSharing: true, IgnoreDts: true, ReadAtNativeFramerate: true });
    const body = tunerBody({ ...f, Url: 'http://p/a.m3u' }, null, true);
    expect(body.FallbackMaxStreamingBitrate).toBe(30_000_000);
    expect(body).not.toHaveProperty('Id');
    expect(body).not.toHaveProperty('IncludeGroups');
    expect(body).not.toHaveProperty('StreamOpenIntervalMs');
    expect(body.SkipVodEntries).toBe(false);
    expect(tunerBody({ ...f, StreamOpenIntervalMs: 0 }, 't1', true)).toMatchObject({ StreamOpenIntervalMs: 0, IncludeGroups: [], ExcludeGroups: [] });
  });

  it('stock Jellyfin gets no Deadfin fields', () => {
    const body = tunerBody({ ...tunerForm(undefined, 'm3u'), StreamOpenIntervalMs: 500 }, 't1', false);
    expect(body).not.toHaveProperty('SkipVodEntries');
    expect(body).not.toHaveProperty('StreamOpenIntervalMs');
    expect(body).not.toHaveProperty('ExcludeGroups');
  });
});
