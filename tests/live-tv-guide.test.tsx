import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { App } from '../src/App';
import { dayValue } from '../src/api/programs';

const SERVER = 'http://s';
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

let seen: URL[] = [];
const HOUR = 3_600_000;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const CHANNELS = [
  { Id: 'c1', Name: 'Trench One', Type: 'TvChannel', ChannelNumber: '1', ImageTags: { Primary: 't1' } },
  { Id: 'c2', Name: 'Trench Two', Type: 'TvChannel', ChannelNumber: '2' },
];
const PROGRAMS = [
  // On now on c1, a first-run episode with SxxEyy parsed by the server.
  {
    Id: 'p1',
    Name: 'Seinfeld',
    Type: 'Program',
    ChannelId: 'c1',
    StartDate: iso(-0.25 * HOUR),
    EndDate: iso(0.25 * HOUR),
    IsSeries: true,
    ParentIndexNumber: 7,
    IndexNumber: 17,
    EpisodeTitle: 'The Doll',
  },
  { Id: 'p2', Name: 'Late News', Type: 'Program', ChannelId: 'c1', StartDate: iso(0.25 * HOUR), EndDate: iso(1.25 * HOUR), IsNews: true, IsLive: true },
  { Id: 'p3', Name: 'Match of the Day', Type: 'Program', ChannelId: 'c2', StartDate: iso(-0.5 * HOUR), EndDate: iso(1.5 * HOUR), IsSports: true },
];

function stubServer(over: Record<string, (u: URL) => Response> = {}) {
  seen = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), SERVER);
    seen.push(url);
    if (over[url.pathname]) return over[url.pathname]!(url);
    switch (url.pathname) {
      case '/Users/Me':
        return json({ Id: 'u1', Name: 'ada', Policy: { IsAdministrator: false } });
      case '/UserViews':
        return json({ Items: [{ Id: 'lt', Name: 'Live TV', CollectionType: 'livetv', Type: 'UserView' }] });
      case '/System/Info/Public':
        return json({ ServerName: 'Test Server', Version: '12.0.0' });
      case '/LiveTv/GuideInfo':
        return json({ StartDate: iso(-HOUR), EndDate: iso(3 * 24 * HOUR) });
      case '/LiveTv/Channels':
        return json({ Items: CHANNELS, TotalRecordCount: 2, StartIndex: 0 });
      case '/LiveTv/Programs': {
        const ids = url.searchParams.getAll('channelIds');
        return json({ Items: PROGRAMS.filter((p) => ids.includes(p.ChannelId)), TotalRecordCount: 0 });
      }
      case '/LiveTv/Programs/Recommended':
        return json({ Items: [{ ...PROGRAMS[0], ChannelName: 'Trench One', ChannelNumber: '1', ChannelPrimaryImageTag: 't1' }] });
      case '/Users/u1/Items/p1':
      case '/Items/p1':
        return json({ ...PROGRAMS[0], ChannelName: 'Trench One', UserData: {} });
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
const GUIDE = '/livetv?topParentId=lt&collectionType=livetv&tab=1';

beforeEach(() => {
  localStorage.setItem('deadfin.session.v1', JSON.stringify({ serverUrl: SERVER, accessToken: 'tok', userId: 'u1', userName: 'ada' }));
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Live TV tabs', () => {
  it('has jellyfin-web’s six tabs and opens on Programs', async () => {
    mount('/livetv?topParentId=lt&collectionType=livetv');
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Programs', 'Guide', 'Channels', 'Recordings', 'Schedule', 'Series']);
    expect(screen.getByRole('tab', { name: 'Programs' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Guide' }));
    await waitFor(() => expect(where()).toBe(GUIDE));
  });
});

describe('recordings, schedule and series', () => {
  const TIMER = {
    Id: 't1',
    Name: 'Late News',
    ProgramId: 'p2',
    ChannelId: 'c1',
    ChannelName: 'Trench One',
    StartDate: iso(0.25 * HOUR),
    EndDate: iso(1.25 * HOUR),
  };

  it('say "No Items" when the server has no DVR, as Deadfin answers', async () => {
    for (const tab of [3, 4, 5]) {
      mount(`/livetv?topParentId=lt&collectionType=livetv&tab=${tab}`);
      expect((await screen.findByTestId('library-empty')).textContent).toBe('No Items are currently available.');
      cleanup();
    }
    const paths = seen.map((u) => u.pathname);
    for (const p of ['/LiveTv/Recordings', '/LiveTv/Recordings/Folders', '/LiveTv/Timers', '/LiveTv/SeriesTimers']) expect(paths).toContain(p);
    const latest = seen.find((u) => u.pathname === '/LiveTv/Recordings' && u.searchParams.get('isInProgress') === 'false')!;
    expect(latest.searchParams.get('limit')).toBe('12');
    const timers = seen.find((u) => u.pathname === '/LiveTv/Timers')!;
    expect(timers.searchParams.get('isScheduled')).toBe('true');
    expect(timers.searchParams.get('isActive')).toBe('false');
  });

  it('Schedule lists timers by day and cancels one after asking', async () => {
    const deleted: string[] = [];
    let timers = [TIMER];
    stubServer({
      '/LiveTv/Timers': () => json({ Items: timers, TotalRecordCount: timers.length }),
    });
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(new URL(String(input), SERVER), init);
      if (req.method === 'DELETE') {
        deleted.push(new URL(req.url).pathname);
        timers = [];
        return new Response(null, { status: 204 });
      }
      return base(input, init);
    });
    mount('/livetv?topParentId=lt&collectionType=livetv&tab=4');
    const group = await screen.findByTestId('timer-group');
    expect(within(group).getByTestId('program-card').getAttribute('href')).toBe('/details?id=p2');
    expect(within(group).getByTestId('program-card').textContent).toContain('Trench One');
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel recording: Late News' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Cancel recording?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel recording' }));
    await waitFor(() => expect(deleted).toEqual(['/LiveTv/Timers/t1']));
    expect((await screen.findByTestId('library-empty')).textContent).toBe('No Items are currently available.');
  });

  it('Series shows each series timer’s time and channel', async () => {
    stubServer({
      '/LiveTv/SeriesTimers': () =>
        json({
          Items: [
            { Id: 's1', Name: 'Seinfeld', RecordAnyTime: true, RecordAnyChannel: true },
            { Id: 's2', Name: 'Late News', RecordAnyTime: false, StartDate: iso(0), ChannelName: 'Trench One' },
          ],
        }),
    });
    mount('/livetv?topParentId=lt&collectionType=livetv&tab=5');
    const cards = await screen.findAllByTestId('series-timer');
    expect(cards[0]!.textContent).toContain('Anytime');
    expect(cards[0]!.textContent).toContain('All channels');
    expect(cards[1]!.textContent).toContain('Trench One');
    expect(within(cards[1]!).getByRole('button', { name: 'Cancel series: Late News' })).toBeTruthy();
    const q = seen.find((u) => u.pathname === '/LiveTv/SeriesTimers')!;
    expect(q.searchParams.get('sortBy')).toBe('SortName');
  });
});

describe('guide', () => {
  it('shows channels × programmes with episode info, badges and the now line', async () => {
    mount(GUIDE);
    const grid = await screen.findByRole('grid', { name: 'TV guide' });
    const rows = await within(grid).findAllByTestId('guide-row');
    expect(rows).toHaveLength(2);
    const seinfeld = await within(rows[0]!).findByRole('link', { name: /^Seinfeld, S7:E17 · The Doll, .*, New, On now$/ });
    expect(seinfeld.getAttribute('href')).toBe('/details?id=p1');
    expect(seinfeld.className).toContain('is-now');
    expect(within(rows[0]!).getByRole('link', { name: /^Late News, .*, Live$/ })).toBeTruthy();
    expect(screen.getByTestId('guide-now-line')).toBeTruthy();
    // A channel plays.
    const ch = within(rows[0]!).getByRole('link', { name: 'Play Trench One' });
    expect(ch.getAttribute('href')).toBe('/video?id=c1');
    expect(screen.getByTestId('library-count').textContent).toBe('2 items');
  });

  it('asks the server as jellyfin-web: favorites first, then the page’s programmes for the window', async () => {
    mount(GUIDE);
    await screen.findAllByTestId('guide-program');
    const ch = seen.find((u) => u.pathname === '/LiveTv/Channels')!;
    expect(ch.searchParams.get('enableFavoriteSorting')).toBe('true');
    expect(ch.searchParams.get('addCurrentProgram')).toBe('false');
    expect(ch.searchParams.get('limit')).toBe('30');
    const pr = seen.find((u) => u.pathname === '/LiveTv/Programs')!;
    expect(pr.searchParams.getAll('channelIds')).toEqual(['c1', 'c2']);
    expect(pr.searchParams.get('sortBy')).toBe('StartDate');
    expect(pr.searchParams.get('enableImages')).toBe('false');
    const from = Date.parse(pr.searchParams.get('minEndDate')!);
    const to = Date.parse(pr.searchParams.get('maxStartDate')!);
    // Today: from the current half hour, 24 hours on.
    expect(from).toBeLessThanOrEqual(now);
    expect(now - from).toBeLessThanOrEqual(30 * 60_000 + 1000);
    expect(to - from).toBe(24 * HOUR - 2000);
  });

  it('moves with the arrow keys, one cell in the Tab order', async () => {
    mount(GUIDE);
    const grid = await screen.findByRole('grid', { name: 'TV guide' });
    await within(grid).findAllByTestId('guide-program');
    const tabbable = grid.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    const start = within(grid).getByRole('link', { name: 'Play Trench One' });
    expect(tabbable[0]).toBe(start);
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    const seinfeld = within(grid).getByRole('link', { name: /^Seinfeld/ });
    expect(document.activeElement).toBe(seinfeld);
    expect(seinfeld.getAttribute('tabindex')).toBe('0');
    expect(start.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(seinfeld, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Late News/);
    // Down keeps the time: the programme on the next channel at that time.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Match of the Day/);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Play Trench Two');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Play Trench One');
  });

  it('picks another day from the guide dates and jumps back to now', async () => {
    mount(GUIDE);
    const day = (await screen.findByRole('combobox', { name: 'Day' })) as HTMLSelectElement;
    const options = Array.from(day.options).map((o) => o.textContent);
    expect(options.slice(0, 2)).toEqual(['Today', 'Tomorrow']);
    expect(options.length).toBeGreaterThanOrEqual(3);
    const d = new Date(now);
    const tomorrow = dayValue(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    fireEvent.change(day, { target: { value: tomorrow } });
    await waitFor(() => expect(where()).toContain(`day=${tomorrow}`));
    // Tomorrow starts at local midnight.
    await waitFor(() =>
      expect(
        seen.some(
          (u) =>
            u.pathname === '/LiveTv/Programs' &&
            Date.parse(u.searchParams.get('minEndDate')!) === new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() + 1000,
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    await waitFor(() => expect(where()).toBe(GUIDE));
  });

  it('at 40,000 channels fetches and draws only the pages in view', async () => {
    const TOTAL = 40_000;
    stubServer({
      '/LiveTv/Channels': (u) => {
        const start = Number(u.searchParams.get('startIndex'));
        const limit = Number(u.searchParams.get('limit'));
        const items = Array.from({ length: Math.min(limit, TOTAL - start) }, (_, i) => ({ Id: `x${start + i}`, Name: `Ch ${start + i + 1}`, Type: 'TvChannel' }));
        return json({ Items: items, TotalRecordCount: TOTAL, StartIndex: start });
      },
    });
    mount(GUIDE);
    const grid = await screen.findByRole('grid', { name: 'TV guide' });
    expect(grid.getAttribute('aria-rowcount')).toBe(String(TOTAL + 1));
    await waitFor(() => expect(within(grid).getAllByTestId('guide-row')).toHaveLength(60));
    const starts = () => seen.filter((u) => u.pathname === '/LiveTv/Channels').map((u) => Number(u.searchParams.get('startIndex')));
    expect(new Set(starts())).toEqual(new Set([0, 30]));
    expect(screen.getByTestId('library-count').textContent).toBe('40000 items');

    // Jump to row 20,000 (rows are 64px; jsdom has no layout, so give the scroller its size).
    const scroller = screen.getByTestId('guide-scroll');
    Object.defineProperty(scroller, 'clientHeight', { value: 640, configurable: true });
    scroller.scrollTop = 20_000 * 64;
    fireEvent.scroll(scroller);
    expect(await within(grid).findByRole('link', { name: 'Play Ch 20001' })).toBeTruthy();
    const rows = within(grid).getAllByTestId('guide-row');
    expect(rows.length).toBeLessThanOrEqual(120);
    expect(within(grid).queryByRole('link', { name: 'Play Ch 1' })).toBeNull();
    // Only the pages around the view were asked for: rows 20,000–20,010 are on pages 666 and 667.
    expect(new Set(starts())).toEqual(new Set([0, 30, 665 * 30, 666 * 30, 667 * 30, 668 * 30]));
    // One cell keeps the Tab stop after its page scrolled away.
    await waitFor(() => expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1));
  });

  it('says so when a channel has no guide data', async () => {
    stubServer({ '/LiveTv/Programs': () => json({ Items: [] }) });
    mount(GUIDE);
    expect(await screen.findAllByText('No guide data')).toHaveLength(2);
  });
});

describe('guide settings', () => {
  it('read and save jellyfin-web’s usersettings keys, keeping the other preferences', async () => {
    let stored: { Id: string; CustomPrefs: Record<string, string> } = { Id: 'usersettings', CustomPrefs: { homesection0: 'resume', 'guide-indicator-repeat': 'true' } };
    const posted: unknown[] = [];
    stubServer({
      '/LiveTv/Programs': (u) =>
        json({ Items: [{ ...PROGRAMS[0]!, IsRepeat: true, IsHD: true }, PROGRAMS[2]!].filter((p) => u.searchParams.getAll('channelIds').includes(p.ChannelId)) }),
      '/DisplayPreferences/usersettings': () => json(stored),
    });
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(new URL(String(input), SERVER), init);
      if (req.method === 'POST' && new URL(req.url).pathname === '/DisplayPreferences/usersettings') {
        stored = await req.json();
        posted.push(stored);
        return new Response(null, { status: 204 });
      }
      return base(input, init);
    });
    mount(GUIDE);
    const grid = await screen.findByRole('grid', { name: 'TV guide' });
    // Repeat is on in the stored settings, so the repeat episode says so.
    expect(await within(grid).findByRole('link', { name: /^Seinfeld, .*, Repeat, On now$/ })).toBeTruthy();
    const ch = () => seen.filter((u) => u.pathname === '/LiveTv/Channels');
    expect(ch()[0]!.searchParams.get('enableFavoriteSorting')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByLabelText('Recently watched'));
    fireEvent.click(within(dialog).getByLabelText('Place favorite channels at the beginning'));
    fireEvent.click(within(dialog).getByLabelText('HD programs'));
    fireEvent.click(within(dialog).getByLabelText('Color coded backgrounds'));
    // Sports only: the channels are filtered and other programmes lose their titles.
    for (const c of ['Movies', 'Kids', 'News']) fireEvent.click(within(dialog).getByLabelText(c));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(posted).toHaveLength(1);
    expect(stored.CustomPrefs).toMatchObject({
      homesection0: 'resume',
      'livetv-channelorder': 'DatePlayed',
      'livetv-favoritechannelsattop': 'false',
      'guide-indicator-hd': 'true',
      'guide-indicator-repeat': 'true',
      'guide-colorcodedbackgrounds': 'true',
    });
    await waitFor(() => expect(ch().some((u) => u.searchParams.get('sortBy') === 'DatePlayed')).toBe(true));
    const last = ch()[ch().length - 1]!;
    expect(last.searchParams.get('enableFavoriteSorting')).toBe('false');
    expect(last.searchParams.get('isSports')).toBe('true');
    expect(last.searchParams.get('isMovie')).toBeNull();
    // The grid is drawn anew for the new channel order.
    const grid2 = await screen.findByRole('grid', { name: 'TV guide' });
    const match = await within(grid2).findByRole('link', { name: /^Match of the Day/ });
    expect(match.className).toContain('is-sports');
    expect(match.textContent).toContain('Match of the Day');
    const seinfeld = within(grid2).getByRole('link', { name: /^Seinfeld/ });
    expect(seinfeld.textContent).toBe('');
  });
});

describe('channels', () => {
  it('cards show what is on now, from one airing request per page', async () => {
    stubServer({
      '/Items': () => json({ Items: CHANNELS, TotalRecordCount: 2 }),
      '/LiveTv/Programs': (u) => {
        const ids = u.searchParams.getAll('channelIds');
        const airing = PROGRAMS.filter((p) => ids.includes(p.ChannelId) && Date.parse(p.StartDate) <= now && Date.parse(p.EndDate) > now);
        return json({ Items: u.searchParams.get('isAiring') === 'true' ? airing : [] });
      },
    });
    mount('/livetv?topParentId=lt&collectionType=livetv&tab=2');
    const now1 = await screen.findAllByTestId('channel-now');
    expect(now1.map((n) => n.textContent)).toEqual([expect.stringContaining('Seinfeld'), expect.stringContaining('Match of the Day')]);
    const airing = seen.filter((u) => u.pathname === '/LiveTv/Programs');
    expect(airing).toHaveLength(1);
    expect(airing[0]!.searchParams.getAll('channelIds')).toEqual(['c1', 'c2']);
    expect(airing[0]!.searchParams.get('enableImages')).toBe('false');
  });
});

describe('programs', () => {
  it('shows On Now and hides empty rows; a card names the episode, time and channel', async () => {
    mount('/livetv?topParentId=lt&collectionType=livetv');
    const row = await screen.findByRole('region', { name: 'On Now' });
    const card = await within(row).findByTestId('program-card');
    expect(card.getAttribute('href')).toBe('/details?id=p1');
    expect(card.textContent).toContain('Seinfeld');
    expect(card.textContent).toContain('S7:E17 · The Doll');
    expect(card.textContent).toMatch(/Ends /);
    expect(card.textContent).toContain('1 Trench One');
    expect(card.textContent).toContain('New');
    await waitFor(() => expect(seen.filter((u) => u.pathname === '/LiveTv/Programs').length).toBe(5));
    expect(screen.getAllByTestId('program-row')).toHaveLength(1);
    const rec = seen.find((u) => u.pathname === '/LiveTv/Programs/Recommended')!;
    expect(rec.searchParams.get('isAiring')).toBe('true');
    expect(rec.searchParams.getAll('fields')).toEqual(['ChannelInfo', 'ChannelImage', 'PrimaryImageAspectRatio']);
    const movies = seen.find((u) => u.pathname === '/LiveTv/Programs' && u.searchParams.get('isMovie') === 'true')!;
    expect(movies.searchParams.get('hasAired')).toBe('false');
    expect(movies.searchParams.get('limit')).toBe('12');
  });

  it('a programme on now plays its channel from its details page', async () => {
    mount('/details?id=p1');
    const play = await screen.findByTestId('action-play');
    expect(screen.getByTestId('detail-meta').textContent).toContain('S7:E17 · The Doll');
    fireEvent.click(play);
    await waitFor(() => expect(where()).toBe('/video?id=c1'));
  });
});
