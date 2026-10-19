import { expect, test, type Page } from './fixtures';

/** A home "Recently Added in …" row by library name. */
const latest = (page: Page, name: string) =>
  page
    .getByTestId('shelf')
    .filter({ has: page.getByTestId('shelf-link').filter({ hasText: new RegExp(`^Recently Added in ${name}\\b`) }) });

/** Opens a library from the My Media row on Home; returns its streamed grid. */
async function openLibrary(page: Page, name: string) {
  await page.goto('./#/home');
  await page.getByTestId('my-media').getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return page.getByTestId('library-grid');
}

const SERVER = process.env.HARNESS_SERVER ?? 'http://localhost:8097';
const EVIDENCE = (process.env.EVIDENCE_DIR ?? new URL('./evidence', import.meta.url).pathname) + '/';

async function signIn(page: Page) {
  await page.goto('./#/login');
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('Server').fill(SERVER);
  await page.getByLabel('User').fill('abyss');
  await page.getByLabel('Password').fill('trench-test-1');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

test('sign in: connect → login → home grid renders the library', async ({ page }) => {
  const front = await page.goto('./#/login');
  // The static front sends the README's hardening headers; the CSP guard
  // (fixtures.ts) then fails any test the policy would break.
  if (process.env.HARNESS_CSP) {
    expect(front?.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(front?.headers()['referrer-policy']).toBe('no-referrer');
  }
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('Server').fill(SERVER);
  await page.getByLabel('User').fill('abyss');
  await page.getByLabel('Password').fill('trench-test-1');
  await page.screenshot({ path: `${EVIDENCE}01-login.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId('connection')).toBeVisible();
  await page.getByTestId('user-menu-button').click();
  await page.getByText('About', { exact: true }).click();
  await expect(page.getByTestId('about-server')).toContainText(process.env.HARNESS_PRODUCT ?? '');
  await expect(page.getByTestId('about-web')).toContainText('web ');
  await page.keyboard.press('Escape');

  // My Media lists the libraries; Recently Added in Movies surfaces…
  await expect(page.getByTestId('my-media').getByRole('link', { name: 'Movies', exact: true })).toBeVisible({ timeout: 20_000 });
  const moviesShelf = latest(page, 'Movies');
  await expect(moviesShelf).toBeVisible({ timeout: 20_000 });
  await expect(moviesShelf.getByTestId('poster').first()).toBeVisible({ timeout: 20_000 });

  // …and at least one real poster image finishes loading.
  await expect(page.locator('.poster-img.is-loaded').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Voyage to the Trench').first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}02-home.png`, fullPage: true });

  // Sign out surfaces back to the login page and drops the session.
  await page.getByTestId('user-menu-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('bad credentials fault visibly, no navigation', async ({ page }) => {
  await page.goto('./#/login');
  await page.getByLabel('Server').fill(SERVER);
  await page.getByLabel('User').fill('abyss');
  await page.getByLabel('Password').fill('wrong-passphrase');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: `${EVIDENCE}03-login-fault.png` });
});

test('continue watching, item detail, user-data toggles', async ({ page }) => {
  await signIn(page);

  // The seeded in-progress movie surfaces first, with its progress strip.
  const resume = page.getByTestId('resume-shelf');
  await expect(resume).toBeVisible({ timeout: 20_000 });
  await expect(resume.getByTestId('poster')).toHaveCount(1);
  await expect(resume.getByTestId('poster-progress')).toBeVisible();

  await page.screenshot({ path: `${EVIDENCE}04-home-userdata.png`, fullPage: true });

  // Into the detail page via the resume card.
  await resume.getByTestId('item-link').click();
  await expect(page).toHaveURL(/\/details\?id=/);
  await expect(page.getByTestId('item-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Voyage to the Trench/ })).toBeVisible();
  await expect(page.getByTestId('detail-progress')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}05-item-detail.png`, fullPage: true });

  // Toggle played on: state flips, survives a full reload (server-persisted)…
  await page.getByTestId('toggle-played').click();
  await expect(page.getByTestId('toggle-played')).toHaveClass(/is-on/);
  await page.reload();
  await expect(page.getByTestId('item-detail')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('toggle-played')).toHaveClass(/is-on/, { timeout: 10_000 });

  // …and toggles cleanly back off.
  await page.getByTestId('toggle-played').click();
  await expect(page.getByTestId('toggle-played')).not.toHaveClass(/is-on/);

  // Favorite toggle round-trips too.
  await page.getByTestId('toggle-favorite').click();
  await expect(page.getByTestId('toggle-favorite')).toHaveClass(/is-on/);
  await page.getByTestId('toggle-favorite').click();
  await expect(page.getByTestId('toggle-favorite')).not.toHaveClass(/is-on/);

  // The played movie wears its played badge in the library grid.
  const grid = await openLibrary(page, 'Movies');
  await expect(grid.getByTestId('poster')).toHaveCount(3, { timeout: 20_000 });
  await expect(grid.getByTestId('poster-played')).toHaveCount(1);
});

test('direct play, controls, and server-verified progress reporting', async ({ page }) => {
  await signIn(page);

  // Un-watched movie → detail → descend into playback.
  await page.getByText('Pressure Hull').first().click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
  const itemUrl = page.url();
  const itemId = itemUrl.split('/details?id=')[1]!.split('&')[0]!;
  await page.getByTestId('action-play').click();
  await expect(page).toHaveURL(/\/video\?id=/);

  // Direct play negotiated and actually rolling.
  const video = page.getByTestId('player-video');
  await expect(video).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0.5);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.mouse.move(200, 200); // wake the controls
  await expect(page.getByTestId('player-controls')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}06-player.png` });

  // Pause, then scrub to ~80%: currentTime jumps forward.
  await page.getByTestId('player-toggle').click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const track = page.getByTestId('player-track');
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(6);

  // Resume playback briefly, then surface — the Stopped report must land.
  await page.getByTestId('player-toggle').click();
  await page.getByTestId('player-back').click();
  await expect(page.getByTestId('item-detail')).toBeVisible();

  // SERVER-SIDE verification: the reported position persisted via the
  // Sessions/Playing pipeline, not just in client state.
  const session = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!,
  ) as { accessToken: string; userId: string };
  await expect
    .poll(
      async () => {
        const res = await page.request.get(
          `${SERVER}/Items/${itemId}?userId=${session.userId}`,
          {
            headers: {
              Authorization: `MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw", Version="0.1.0", Token="${session.accessToken}"`,
            },
          },
        );
        const body = (await res.json()) as {
          UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
        };
        return body.UserData?.Played ? -1 : (body.UserData?.PlaybackPositionTicks ?? 0);
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  // Resume path: the seeded in-progress movie starts at its saved depth (~4s).
  await page.goto('./');
  await page.getByTestId('resume-shelf').getByTestId('item-link').click();
  await page.getByTestId('action-resume').click();
  await expect(page).toHaveURL(/\/video\?id=.*&t=/);
  await expect
    .poll(async () => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(3.5);
});

test('sign-out ends the server session', async ({ page }) => {
  await signIn(page);
  const session = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!,
  ) as { accessToken: string };
  await page.getByTestId('user-menu-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The old token no longer authenticates.
  await expect
    .poll(async () => {
      const res = await page.request.get(`${SERVER}/Users/Me`, {
        headers: {
          Authorization: `MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw", Version="0.1.0", Token="${session.accessToken}"`,
        },
      });
      return res.status();
    })
    .toBe(401);
});

test('a revoked token returns to sign-in with a message', async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId('shelf').first()).toBeVisible({ timeout: 20_000 });

  // End the session server-side, as a dashboard device delete would.
  const session = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!,
  ) as { accessToken: string };
  const logout = await page.request.post(`${SERVER}/Sessions/Logout`, {
    headers: {
      Authorization: `MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw", Version="0.1.0", Token="${session.accessToken}"`,
    },
  });
  expect(logout.status()).toBe(204);

  await page.reload();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await expect(page.getByTestId('session-ended')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('deadfin.session.v1'))).toBeNull();
});

test('library page: count, paging, sort, filter and alphabet', async ({ page }) => {
  await signIn(page);

  // Home shows the newest of the library; the library page has everything.
  await expect(latest(page, 'Archive').getByTestId('poster').first()).toBeVisible({ timeout: 20_000 });
  const grid = await openLibrary(page, 'Archive');
  await expect(page).toHaveURL(/#\/movies\?topParentId=/);
  await expect(page.getByRole('tab', { selected: true })).toHaveText('Movies');
  await expect(page.getByTestId('library-count')).toHaveText('40 items');

  // 40 titles, 36 per page: the second page arrives on scroll or on demand.
  await expect(grid.getByTestId('poster')).not.toHaveCount(0);
  const more = page.getByTestId('library-more');
  if (await more.isVisible()) await more.click();
  await expect(grid.getByTestId('poster')).toHaveCount(40, { timeout: 15_000 });
  await expect(grid.getByTestId('item-link').first()).toContainText('Archive Reel 01');
  await page.screenshot({ path: `${EVIDENCE}07-library.png`, fullPage: true });

  // Sort menu: choosing Name again flips it to descending, as in jellyfin-web.
  await page.getByRole('button', { name: /^Sort: Name/ }).click();
  await page.getByRole('menuitemradio', { name: /^Name/ }).click();
  await expect(grid.getByTestId('item-link').first()).toContainText('Archive Reel 40');
  await expect(page).toHaveURL(/sortOrder=Descending/);

  // Filter dialog: nothing in this library is played.
  await page.getByRole('button', { name: /^Filter/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await dialog.getByLabel('Played', { exact: true }).check();
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await expect(page).toHaveURL(/filters=IsPlayed/);
  await dialog.getByRole('button', { name: 'Reset filters' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('library-count')).toHaveText('40 items');

  // Alphabet picker: no title starts with Z.
  await page.getByRole('group', { name: 'Alphabet' }).getByRole('button', { name: 'Z', exact: true }).click();
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByRole('group', { name: 'Alphabet' }).getByRole('button', { name: 'A', exact: true }).click();
  await expect(page.getByTestId('library-count')).toHaveText('40 items');

  // The old path still lands on the library.
  const url = new URL(page.url().replace('#/', ''));
  await page.goto(`./#/library/${url.searchParams.get('topParentId')}`);
  await expect(page).toHaveURL(/#\/movies\?topParentId=/);
});

test('library tabs and home favorites follow jellyfin-web', async ({ page }) => {
  await signIn(page);
  const { headers, userId } = await sessionApi(page);
  const grid = await openLibrary(page, 'Movies');
  await expect(page.getByRole('tab')).toHaveText(['Movies', 'Suggestions', 'Favorites', 'Collections', 'Genres', 'Studios', 'Playlists']);
  const voyage = grid.getByTestId('item-link').filter({ hasText: 'Voyage to the Trench' });
  const id = new URLSearchParams((await voyage.getAttribute('href'))!.split('?')[1]).get('id')!;

  // Suggestions: the in-progress movie is in Continue Watching.
  await page.getByRole('tab', { name: 'Suggestions' }).click();
  await expect(page).toHaveURL(/tab=1/);
  await expect(page.getByTestId('suggestion-row').filter({ hasText: 'Continue Watching' }).getByTestId('poster')).toHaveCount(1, {
    timeout: 15_000,
  });

  // Favorites tab and Home → Favorites show a favorite movie.
  await page.request.post(`${SERVER}/UserFavoriteItems/${id}?userId=${userId}`, { headers });
  try {
    await page.getByRole('tab', { name: 'Favorites' }).click();
    await expect(page.getByTestId('library-grid').getByTestId('poster')).toHaveCount(1, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Collections' }).click();
    await expect(page.getByTestId('library-empty')).toBeVisible();

    await page.goto('./#/home?tab=1');
    const movies = page.getByTestId('favorites-row').filter({ hasText: 'Movies' }).first();
    await expect(movies.getByText('Voyage to the Trench')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${EVIDENCE}21-favorites.png`, fullPage: true });
    // The row title opens the list of favorite movies.
    await movies.getByTestId('shelf-link').click();
    await expect(page).toHaveURL(/#\/list\?type=Movie&IsFavorite=true/);
    await expect(page.getByTestId('library-count')).toHaveText('1 item');
  } finally {
    await page.request.delete(`${SERVER}/UserFavoriteItems/${id}?userId=${userId}`, { headers });
  }
});

/** Auth headers and user id of the signed-in browser session, for API checks. */
async function sessionApi(page: Page) {
  const session = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!,
  ) as { accessToken: string; userId: string };
  const headers = {
    Authorization: `MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw", Version="0.1.0", Token="${session.accessToken}"`,
  };
  return { headers, userId: session.userId };
}

/** The three fixture episodes, all unplayed (the deadfin target runs the suite twice). */
async function resetEpisodes(page: Page) {
  const { headers, userId } = await sessionApi(page);
  const eps = (await (
    await page.request.get(`${SERVER}/Items?userId=${userId}&recursive=true&includeItemTypes=Episode&sortBy=SortName`, { headers })
  ).json()) as { Items: { Id: string; Name: string }[] };
  expect(eps.Items.length).toBe(3);
  for (const e of eps.Items) {
    await page.request.delete(`${SERVER}/UserPlayedItems/${e.Id}?userId=${userId}`, { headers });
  }
  return { headers, userId, episodes: eps.Items };
}

test('tv: series, seasons, episodes, next up and up next', async ({ page }) => {
  await signIn(page);
  const { headers, userId, episodes } = await resetEpisodes(page);
  await page.reload();

  // Series card → series page: no Play button for the series itself, seasons as tabs.
  await (await openLibrary(page, 'Shows')).getByTestId('item-link').first().click();
  await expect(page.getByTestId('series')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Trench Tales' })).toBeVisible();
  await expect(page.getByTestId('action-play')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { selected: true })).toHaveText(/Season 1/);
  const rows = page.getByTestId('episode-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('S1:E1');
  await expect(page.getByTestId('series-play-next')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}08-series.png`, fullPage: true });

  await page.getByRole('tab', { name: /Specials/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Special');
  await page.getByRole('tab', { name: /Season 1/ }).click();
  await expect(rows).toHaveCount(2);

  // Episode page: breadcrumbs back to the series, and a Play button.
  await rows.first().getByRole('link', { name: /First Dive/ }).click();
  await expect(page.getByTestId('detail-crumbs')).toContainText('Trench Tales');
  await expect(page.getByTestId('action-play')).toBeVisible();

  // Episode 1 watched (through the API): Next Up on home is episode 2.
  const first = episodes.find((e) => /First Dive/.test(e.Name))!;
  await page.request.post(`${SERVER}/UserPlayedItems/${first.Id}?userId=${userId}`, { headers });
  await page.goto('./');
  const nextUp = page.getByTestId('next-up-shelf');
  await expect(nextUp).toBeVisible({ timeout: 15_000 });
  await expect(nextUp.getByTestId('poster').first()).toContainText('S1:E2');

  // From the series, play episode 1 to its end: the next episode is offered.
  await (await openLibrary(page, 'Shows')).getByTestId('item-link').first().click();
  await expect(page.getByTestId('series-play-next')).toContainText('S1:E2');
  await page.getByRole('button', { name: /^Play S1:E1/ }).click();
  const video = page.getByTestId('player-video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration || 0), { timeout: 15_000 }).toBeGreaterThan(5);
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration - 0.5;
    void v.play();
  });
  const upNext = page.getByTestId('up-next');
  await expect(upNext).toBeVisible({ timeout: 15_000 });
  await expect(upNext).toContainText('S1:E2');
  await page.screenshot({ path: `${EVIDENCE}09-up-next.png` });
  await page.getByTestId('up-next-play').click();
  await expect(page).toHaveURL(/\/video\?id=/);
  await expect.poll(() => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
});

test('tv: marking an episode played sticks', async ({ page }) => {
  await signIn(page);
  await resetEpisodes(page);
  await page.reload();
  await (await openLibrary(page, 'Shows')).getByTestId('item-link').first().click();
  await page.getByTestId('episode-row').first().getByRole('link', { name: /First Dive/ }).click();
  await page.getByTestId('toggle-played').click();
  await expect(page.getByTestId('toggle-played')).toHaveClass(/is-on/);
  await page.reload();
  await expect(page.getByTestId('toggle-played')).toHaveClass(/is-on/, { timeout: 10_000 });
});

test('quick connect: a waiting device is signed in by its code', async ({ page }) => {
  // The "TV": an unauthenticated device asks the server for a code.
  const tv = { Authorization: 'MediaBrowser Client="Deadfin Accept TV", Device="tv", DeviceId="pw-tv", Version="0.1.0"' };
  const initiate = await page.request.post(`${SERVER}/QuickConnect/Initiate`, { headers: tv });
  expect(initiate.ok()).toBe(true);
  const { Code: code, Secret: secret } = (await initiate.json()) as { Code: string; Secret: string };

  await signIn(page);
  await page.getByTestId('user-menu-button').click();
  await page.getByTestId('quick-connect-link').click();
  await expect(page.getByRole('heading', { name: 'Quick Connect' })).toBeVisible();

  // A wrong code says what went wrong and authorizes nothing.
  const wrong = code === '000000' ? '000001' : '000000';
  await page.getByLabel('Code').fill(wrong);
  await page.getByRole('button', { name: 'Sign in device' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Code').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await page.getByRole('button', { name: 'Sign in device' }).click();
  await expect(page.getByTestId('quick-connect-done')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}08-quick-connect.png` });

  // The TV's poll now reports it authenticated.
  const state = await page.request.get(`${SERVER}/QuickConnect/Connect?secret=${secret}`, { headers: tv });
  expect(((await state.json()) as { Authenticated?: boolean }).Authenticated).toBe(true);
});

test('search: results grouped by kind, links to the item, empty state', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('search-link').click();
  // An empty search suggests titles to try.
  await expect(page.getByTestId('search-suggestions').getByRole('link').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('searchbox', { name: 'Search' }).fill('trench');
  await expect(page).toHaveURL(/search\?q=trench/);
  const movies = page.getByTestId('search-group').filter({ hasText: 'Movies' });
  await expect(movies.getByText('Voyage to the Trench')).toBeVisible();
  await expect(movies.getByTestId('poster')).toHaveCount(1);
  await page.screenshot({ path: `${EVIDENCE}09-search.png`, fullPage: true });

  await movies.getByTestId('item-link').click();
  await expect(page).toHaveURL(/\/details\?id=/);
  await expect(page.getByRole('heading', { name: /Voyage to the Trench/ })).toBeVisible();

  // Back keeps the search; a term nothing matches says so.
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('trench');
  await page.getByRole('searchbox', { name: 'Search' }).fill('zzqx-nothing');
  await expect(page.getByTestId('search-empty')).toBeVisible();
});

test('transcode: a file the browser cannot decode plays through HLS', async ({ page }) => {
  await signIn(page);
  // Deadfin v0.3.0-rc.3 finding: its HLS encoder makes H.264/AAC only, yet
  // PlaybackInfo hands out a TranscodingUrl for the profile's codecs (AV1/Opus
  // for Playwright's Chromium, which has no H.264), and master.m3u8 answers
  // 501. Marked as expected to fail there until the server either encodes the
  // requested codecs or stops offering them; a pass will flag this line.
  const h264 = await page.evaluate(() => MediaSource.isTypeSupported('video/mp4; codecs="avc1.640029"'));
  test.fail(process.env.HARNESS_PRODUCT === 'Deadfin' && !h264, 'Deadfin HLS encodes H.264/AAC only');
  await page.getByTestId('shelf').filter({ hasText: 'Other formats' }).getByTestId('item-link').filter({ hasText: 'Hull Breach' }).click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
  const itemId = page.url().split('/details?id=')[1]!.split('&')[0]!;
  await page.getByTestId('action-play').click();

  const video = page.getByTestId('player-video');
  await expect(video).toHaveAttribute('data-play-method', 'Transcode', { timeout: 15_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 45_000 })
    .toBeGreaterThan(2);
  await page.screenshot({ path: `${EVIDENCE}10-transcode.png` });

  // Pause mid-stream, surface; the server records where the transcode stopped.
  await page.getByTestId('player-toggle').click();
  const at = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.getByTestId('player-back').click();
  await expect(page.getByTestId('item-detail')).toBeVisible();

  const session = JSON.parse((await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!);
  const auth = {
    Authorization: `MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw", Version="0.1.0", Token="${session.accessToken}"`,
  };
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${SERVER}/Items/${itemId}?userId=${session.userId}`, { headers: auth });
        const body = (await res.json()) as { UserData?: { PlaybackPositionTicks?: number } };
        return (body.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(Math.max(0.5, at - 2));
});

async function playFromFormats(page: Page, title: string) {
  await signIn(page);
  const shelf = page.getByTestId('shelf').filter({ hasText: 'Other formats' });
  await shelf.getByTestId('item-link').filter({ hasText: title }).click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
  await page.getByTestId('action-play').click();
  const video = page.getByTestId('player-video');
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 45_000 })
    .toBeGreaterThan(1);
  return video;
}

async function openTrackMenu(page: Page) {
  await page.mouse.move(300, 300);
  await page.getByTestId('player-tracks').click();
  return page.getByTestId('track-menu');
}

test('tracks: a sidecar srt shows as subtitles', async ({ page }) => {
  const video = await playFromFormats(page, 'Sonar Log');
  const menu = await openTrackMenu(page);
  await menu.getByRole('radio', { name: /eng/i }).check();
  await expect
    .poll(
      async () =>
        video.evaluate((v: HTMLVideoElement) => {
          const t = v.textTracks[0];
          return t && t.mode === 'showing' ? (t.cues?.length ?? 0) : -1;
        }),
      { timeout: 10_000 },
    )
    .toBe(2);
  expect(await video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.cues?.[0] && (v.textTracks[0].cues[0] as VTTCue).text)).toContain('Contact bearing');
  await page.screenshot({ path: `${EVIDENCE}11-subtitles.png` });

  await menu.getByRole('radio', { name: 'Off' }).check();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.textTracks.length)).toBe(0);
});

test('tracks: switching audio re-negotiates and keeps the position', async ({ page }) => {
  // Switching audio means a server-built stream: the same Deadfin H.264-only
  // finding as the transcode test applies in a browser without H.264.
  await page.goto('./#/login');
  const h264 = await page.evaluate(() => MediaSource.isTypeSupported('video/mp4; codecs="avc1.640029"'));
  test.fail(process.env.HARNESS_PRODUCT === 'Deadfin' && !h264, 'Deadfin HLS encodes H.264/AAC only');

  const video = await playFromFormats(page, 'Twin Echo');
  await expect(video).toHaveAttribute('data-play-method', 'DirectPlay');
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(3);
  const menu = await openTrackMenu(page);
  await expect(menu.getByRole('radio', { name: /English/ })).toBeChecked();
  const at = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const renegotiated = page.waitForRequest(/master\.m3u8.*AudioStreamIndex=2/i, { timeout: 15_000 });
  await menu.getByRole('radio', { name: /French/ }).check();
  await renegotiated;
  await expect(video).toHaveAttribute('data-play-method', 'Transcode', { timeout: 15_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => (v.paused ? -1 : v.currentTime)), { timeout: 45_000 })
    .toBeGreaterThan(at - 2);
  await expect(menu.getByRole('radio', { name: /French/ })).toBeChecked();
});

test('app bar, drawer, user menu and dashboard follow jellyfin-web', async ({ page }) => {
  await signIn(page);

  // Drawer: Home, Favorites, then the libraries.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'Main menu' });
  await expect(drawer.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Favorites' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Movies', exact: true }).click();
  await expect(page).toHaveURL(/#\/movies\?topParentId=/);
  await expect(drawer).toBeHidden();

  // User menu → Dashboard (the harness user is an administrator).
  await page.getByTestId('user-menu-button').click();
  await page.getByRole('menuitem', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByTestId('dashboard-server')).toContainText(process.env.HARNESS_PRODUCT === 'Deadfin' ? 'Deadfin' : '');
  const dash = page.getByRole('navigation', { name: 'Dashboard menu' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await dash.getByRole('link', { name: 'Live TV' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv$/);
  await expect(page.getByRole('heading', { name: 'Live TV', level: 1 })).toBeVisible();

  // Old paths still land.
  await page.goto('./#/admin/livetv');
  await expect(page).toHaveURL(/#\/dashboard\/livetv$/);
  await page.screenshot({ path: `${EVIDENCE}20-dashboard.png`, fullPage: true });
});

test('streamed list: 40,000 items show at once, thumbnails within 1 s', async ({ page }) => {
  // The server answers are synthetic (page.route), so this times the client
  // alone: first page, lazy thumbnails, and paging on scroll. Dev has a
  // 40,159-channel Live TV view; this keeps that list fast.
  const TOTAL = 40_000;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route(
    (url) => url.pathname.endsWith('/Items') && url.searchParams.get('parentId') === 'big-view',
    (route) => {
      const q = new URL(route.request().url()).searchParams;
      const start = Number(q.get('startIndex') ?? 0);
      const limit = Number(q.get('limit') ?? 36);
      const Items = Array.from({ length: Math.min(limit, TOTAL - start) }, (_, i) => ({
        Id: `ch${start + i}`,
        Name: `Channel ${start + i}`,
        Type: 'TvChannel',
        ImageTags: { Primary: 't' },
      }));
      return route.fulfill({ json: { Items, TotalRecordCount: TOTAL, StartIndex: start } });
    },
  );
  await page.route(/\/Items\/ch\d+\/Images\/Primary/, (route) =>
    route.fulfill({ body: png, contentType: 'image/png' }),
  );

  await signIn(page);
  const started = Date.now();
  await page.goto('./#/library/big-view');
  await expect(page.getByTestId('library-count')).toHaveText('40000 items');
  await expect(page.getByTestId('poster').first()).toBeVisible({ timeout: 1_000 });
  await expect(page.locator('.poster-img.is-loaded').first()).toBeVisible({ timeout: 1_000 });
  const firstRowsMs = Date.now() - started;
  expect(firstRowsMs, 'first rows and a thumbnail').toBeLessThan(2_000);

  // Scrolling streams the next pages in.
  const before = await page.getByTestId('poster').count();
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => page.getByTestId('poster').count(), { timeout: 3_000 }).toBeGreaterThan(before);
});

test('dashboard playback and networking pages load and save like jellyfin-web', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/dashboard');
  const dash = page.getByRole('navigation', { name: 'Dashboard menu' });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Transcoding: jellyfin-web's fields; the decoder list follows the acceleration type.
  await dash.getByRole('link', { name: 'Transcoding' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/playback\/transcoding$/);
  const hwa = page.getByLabel('Hardware acceleration');
  await expect(hwa).toHaveValue('none');
  await expect(page.getByTestId('hw-decoding')).toHaveCount(0);
  await hwa.selectOption('vaapi');
  await expect(page.getByTestId('hw-decoding').getByLabel('HEVC', { exact: true })).toBeVisible();
  await hwa.selectOption('none');
  await expect(page.getByLabel('Transcoding thread count')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  // Resume: a save reaches the server and survives a reload; then restore it.
  await dash.getByRole('link', { name: 'Resume' }).click();
  const maxPct = page.getByLabel('Maximum resume percentage');
  const before = await maxPct.inputValue();
  await maxPct.fill('91');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Maximum resume percentage')).toHaveValue('91');
  await page.getByLabel('Maximum resume percentage').fill(before);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await dash.getByRole('link', { name: 'Streaming' }).click();
  await expect(page.getByLabel('Internet streaming bitrate limit (Mbps)')).toBeVisible();
  await dash.getByRole('link', { name: 'Trickplay' }).click();
  await expect(page.getByLabel('Width Resolutions')).not.toHaveValue('');

  // Networking: read only here; a save could move the harness server's port.
  await dash.getByRole('link', { name: 'Networking' }).click();
  await expect(page.getByLabel('Local HTTP port number')).toHaveValue('8096');
  await expect(page.getByRole('heading', { name: 'Remote Access Settings' })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}21-dashboard-networking.png`, fullPage: true });
});

test('dashboard live tv: add, edit and delete an M3U tuner and an XMLTV provider', async ({ page }) => {
  test.setTimeout(120_000);
  const deadfin = process.env.HARNESS_PRODUCT === 'Deadfin';
  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/dashboard/livetv');
  const noLiveTv = page.getByText('This server has no Live TV settings.');
  await expect(page.getByRole('heading', { name: 'Tuner Devices' }).or(noLiveTv)).toBeVisible();
  // Live TV is on Deadfin's v0.4 line; a v0.3 image answers 404 for `livetv`.
  test.skip(deadfin && (await noLiveTv.isVisible()), 'this Deadfin image has no Live TV');

  // Add Tuner Device → M3U from a playlist file.
  await page.getByRole('link', { name: '+ Add Tuner Device' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv\/tuner$/);
  const form = page.getByTestId('tuner-form');
  await form.getByLabel('Tuner type').selectOption('m3u');
  await form.getByLabel('Friendly name').fill('Harness M3U');
  await form.getByLabel('File or URL').fill('/media/livetv/harness.m3u');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv$/, { timeout: 30_000 });
  const card = page.getByTestId('tuner-card').filter({ hasText: 'Harness M3U' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('/media/livetv/harness.m3u');

  // Edit: the stored values come back; Deadfin adds its own fields and the group filter.
  await card.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv\/tuner\?id=/);
  await expect(form.getByLabel('File or URL')).toHaveValue('/media/livetv/harness.m3u');
  await expect(form.getByLabel('Tuner type')).toBeDisabled();
  if (deadfin) {
    await expect(form.getByLabel('Skip VOD entries')).toBeVisible();
    await expect(page.getByTestId('tuner-groups')).toBeVisible();
  } else {
    await expect(form.getByLabel('Skip VOD entries')).toHaveCount(0);
  }
  await form.getByLabel('Simultaneous stream limit').fill('2');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv$/, { timeout: 30_000 });

  // Add Provider → XMLTV for that tuner, then Map Channels lists its channels.
  await page.getByRole('button', { name: '+ Add Provider' }).click();
  await page.getByRole('menuitem', { name: 'XMLTV' }).click();
  const xml = page.getByTestId('xmltv-form');
  await xml.getByLabel('File or URL').fill('/media/livetv/harness.xml');
  await xml.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/livetv$/, { timeout: 30_000 });
  const provider = page.getByTestId('provider-item').filter({ hasText: '/media/livetv/harness.xml' });
  await expect(provider).toHaveCount(1);
  await provider.getByRole('button', { name: 'Map Channels' }).click();
  const mapper = page.getByTestId('channel-mapper');
  await expect(mapper.getByTestId('channel-row').filter({ hasText: 'Trench One' })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${EVIDENCE}22-dashboard-livetv-map.png`, fullPage: true });
  await mapper.getByRole('button', { name: 'Back' }).click();
  await page.screenshot({ path: `${EVIDENCE}23-dashboard-livetv.png`, fullPage: true });

  // Delete both, so the second deadfin pass starts clean.
  await provider.getByRole('button', { name: 'Delete' }).click();
  await provider.getByRole('group').getByRole('button', { name: 'Delete' }).click();
  await expect(provider).toHaveCount(0);
  await card.getByRole('button', { name: 'Delete' }).click();
  await card.getByRole('group').getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0);
});
