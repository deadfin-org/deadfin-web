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

  // Series card → series page, as jellyfin-web: Play, Next Up, then the Seasons row.
  await (await openLibrary(page, 'Shows')).getByTestId('item-link').first().click();
  await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'Series', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Trench Tales' })).toBeVisible();
  await expect(page.getByTestId('action-play')).toBeVisible();
  const seasons = page.getByTestId('seasons');
  await expect(seasons.getByTestId('item-link')).toHaveCount(2);
  await page.screenshot({ path: `${EVIDENCE}08-series.png`, fullPage: true });

  // A season has its own page with the episode list.
  await seasons.getByTestId('item-link').filter({ hasText: 'Specials' }).click();
  const rows = page.getByTestId('episode-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(/Special - .*Behind the Hull/);
  await page.goBack();
  await page.getByTestId('seasons').getByTestId('item-link').filter({ hasText: 'Season 1' }).click();
  await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'Season');
  await expect(page.getByTestId('detail-crumbs')).toContainText('Trench Tales');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(/1\. .*First Dive/);
  await page.screenshot({ path: `${EVIDENCE}08b-season.png`, fullPage: true });

  // Episode page: series and season links, Play, and More from Season 1.
  await rows.first().getByRole('link', { name: /First Dive/ }).click();
  await expect(page.getByTestId('detail-crumbs')).toContainText('Trench Tales');
  await expect(page.getByTestId('detail-crumbs').getByRole('link', { name: 'Season 1' })).toBeVisible();
  await expect(page.getByTestId('action-play')).toBeVisible();
  await expect(page.getByTestId('more-from-season').getByTestId('wide-card')).toHaveCount(2);

  // Episode 1 watched (through the API): Next Up on home is episode 2.
  const first = episodes.find((e) => /First Dive/.test(e.Name))!;
  await page.request.post(`${SERVER}/UserPlayedItems/${first.Id}?userId=${userId}`, { headers });
  await page.goto('./');
  const nextUp = page.getByTestId('next-up-shelf');
  await expect(nextUp).toBeVisible({ timeout: 15_000 });
  await expect(nextUp.getByTestId('poster').first()).toContainText('S1:E2');

  // The series' Next Up and its Play button follow.
  await (await openLibrary(page, 'Shows')).getByTestId('item-link').first().click();
  await expect(page.getByTestId('next-up')).toContainText('S1:E2');

  // From the season, play episode 1 to its end: the next episode is offered.
  await page.getByTestId('seasons').getByTestId('item-link').filter({ hasText: 'Season 1' }).click();
  await page.getByRole('button', { name: /^Play 1\. .*First Dive/ }).click();
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
  await page.getByTestId('seasons').getByTestId('item-link').filter({ hasText: 'Season 1' }).click();
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

/** The signed-in page's token, for server-side checks. */
async function sessionToken(page: Page): Promise<string> {
  const s = JSON.parse((await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!) as { accessToken: string };
  return s.accessToken;
}

const authHeader = (token?: string, device = 'pw', deviceId = 'pw') =>
  `MediaBrowser Client="Deadfin Accept", Device="${device}", DeviceId="${deviceId}", Version="0.1.0"${token ? `, Token="${token}"` : ''}`;

/**
 * Deadfin before deadfin#741 answers 404 for /Devices and /System/Logs; on
 * that image the test is an expected failure, not a client defect.
 */
async function expectFailWithoutRoute(page: Page, route: string) {
  if (process.env.HARNESS_PRODUCT !== 'Deadfin') return;
  const res = await page.request.get(`${SERVER}${route}`, { headers: { Authorization: authHeader(await sessionToken(page)) } });
  test.fail(res.status() === 404, `Deadfin image without ${route} (deadfin#741)`);
}

test('dashboard: API keys are created and revoked', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/dashboard');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('navigation', { name: 'Dashboard menu' }).getByRole('link', { name: 'API Keys' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/keys$/);
  await expect(page.getByRole('heading', { name: 'API Keys', level: 1 })).toBeVisible();
  await expect(page.getByTestId('api-keys-table')).toBeVisible();

  await page.getByRole('button', { name: 'New API Key' }).click();
  await page.getByLabel('App name').fill('accept-throwaway');
  await page.getByRole('button', { name: 'Create' }).click();
  const row = page.getByTestId('api-key-row').filter({ hasText: 'accept-throwaway' });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  const key = (await row.locator('td').first().textContent())!.trim();
  expect(key).toMatch(/^\S{16,}$/);
  const probe = () =>
    page.request.get(`${SERVER}/System/Info`, { headers: { Authorization: authHeader(key) } }).then((r) => r.status());
  expect(await probe()).toBe(200);
  await page.screenshot({ path: `${EVIDENCE}21-dashboard-keys.png`, fullPage: true });

  await row.getByRole('button', { name: /Revoke/ }).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(probe).toBe(401);
});

test('dashboard: devices are listed, renamed and deleted', async ({ page }) => {
  await signIn(page);
  await expectFailWithoutRoute(page, '/Devices');

  // A throwaway device: its own sign-in, so deleting it ends only that token.
  const login = await page.request.post(`${SERVER}/Users/AuthenticateByName`, {
    headers: { Authorization: authHeader(undefined, 'Throwaway', 'accept-throwaway-device'), 'Content-Type': 'application/json' },
    data: { Username: 'abyss', Pw: 'trench-test-1' },
  });
  expect(login.status()).toBe(200);
  const throwawayToken = ((await login.json()) as { AccessToken: string }).AccessToken;

  await page.goto('./#/dashboard');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('navigation', { name: 'Dashboard menu' }).getByRole('link', { name: 'Devices' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/devices$/);
  await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();

  // The browser in use cannot be deleted from here.
  const rows = page.getByTestId('device-row');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const own = rows.filter({ hasText: 'Deadfin Web' }).filter({ has: page.locator('button[aria-label^="Delete"]:disabled') });
  await expect(own).toHaveCount(1);

  const throwaway = rows.filter({ hasText: 'Throwaway' });
  await expect(throwaway).toHaveCount(1);
  await throwaway.getByRole('button', { name: /^Edit/ }).click();
  await page.getByLabel('Device', { exact: true }).fill('Throwaway renamed');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: 'Throwaway renamed' })).toHaveCount(1, { timeout: 10_000 });
  await page.reload();
  const renamed = rows.filter({ hasText: 'Throwaway renamed' });
  await expect(renamed).toHaveCount(1, { timeout: 10_000 });
  await page.screenshot({ path: `${EVIDENCE}22-dashboard-devices.png`, fullPage: true });

  await renamed.getByRole('button', { name: /^Delete/ }).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(renamed).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(() =>
      page.request
        .get(`${SERVER}/Users/Me`, { headers: { Authorization: authHeader(throwawayToken, 'Throwaway', 'accept-throwaway-device') } })
        .then((r) => r.status()),
    )
    .toBe(401);
});

test('dashboard: activity streams, with the user and system filter', async ({ page }) => {
  await signIn(page);
  await page.goto('./#/dashboard');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('navigation', { name: 'Dashboard menu' }).getByRole('link', { name: 'Activity' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/activity$/);
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
  await expect(page.getByTestId('activity-row').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('columnheader', { name: 'User' })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}23-dashboard-activity.png`, fullPage: true });

  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page).toHaveURL(/useractivity=false/);
  await expect(page.getByRole('columnheader', { name: 'User' })).toHaveCount(0);
  await page.getByRole('button', { name: 'User', exact: true }).click();
  await expect(page).toHaveURL(/useractivity=true/);
  await expect(page.getByTestId('activity-row').first()).toBeVisible({ timeout: 10_000 });
});

test('dashboard: activity streams 5,000 entries as it scrolls', async ({ page }) => {
  // Synthetic answers time the client alone, as the 40,000-item list.
  const TOTAL = 5_000;
  const asked: number[] = [];
  await page.route(
    (url) => url.pathname.endsWith('/System/ActivityLog/Entries'),
    (route) => {
      const q = new URL(route.request().url()).searchParams;
      const start = Number(q.get('startIndex') ?? 0);
      const limit = Number(q.get('limit') ?? 50);
      asked.push(limit);
      const Items = Array.from({ length: Math.min(limit, TOTAL - start) }, (_, i) => ({
        Id: TOTAL - start - i,
        Name: `Entry ${start + i}`,
        Type: 'SessionStarted',
        Severity: 'Information',
        Date: new Date(Date.UTC(2026, 9, 19) - (start + i) * 60_000).toISOString(),
      }));
      return route.fulfill({ json: { Items, TotalRecordCount: TOTAL, StartIndex: start } });
    },
  );
  await signIn(page);
  const started = Date.now();
  await page.goto('./#/dashboard/activity');
  await expect(page.getByTestId('activity-count')).toHaveText('5000 entries');
  await expect(page.getByTestId('activity-row').first()).toBeVisible({ timeout: 1_000 });
  expect(Date.now() - started, 'first rows').toBeLessThan(2_000);
  expect(asked.every((n) => n <= 50), 'pages, not the whole log').toBe(true);

  const before = await page.getByTestId('activity-row').count();
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => page.getByTestId('activity-row').count(), { timeout: 3_000 }).toBeGreaterThan(before);
});

test('dashboard: logs list and file view', async ({ page }) => {
  await signIn(page);
  await expectFailWithoutRoute(page, '/System/Logs');
  await page.goto('./#/dashboard');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('navigation', { name: 'Dashboard menu' }).getByRole('link', { name: 'Logs' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/logs$/);
  await expect(page.getByRole('heading', { name: 'Logs', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Log a warning message if the server was slow to answer')).toBeVisible();

  const first = page.getByTestId('log-list').getByRole('link').first();
  await expect(first).toBeVisible({ timeout: 10_000 });
  const name = (await first.locator('.log-name').textContent())!.trim();
  await page.screenshot({ path: `${EVIDENCE}24-dashboard-logs.png`, fullPage: true });
  await first.click();
  await expect(page).toHaveURL(new RegExp(`#/dashboard/logs/${name.replace(/\./g, '\\.')}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByTestId('log-text')).not.toBeEmpty({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Watch' }).first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}25-dashboard-log-file.png` });
});

/** Opens a movie's details page from its library page. */
async function openMovie(page: Page, library: string, title: string) {
  await (await openLibrary(page, library)).getByTestId('item-link').filter({ hasText: title }).click();
  await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'Movie', { timeout: 15_000 });
  return page.url().split('/details?id=')[1]!.split('&')[0]!;
}

test('details: header, overview, people, person page, More menu', async ({ page }) => {
  await signIn(page);
  await openMovie(page, 'Movies', 'Pressure Hull');

  // Header: title, year and runtime in the info line; Ends at for a video.
  await expect(page.getByRole('heading', { level: 1, name: 'Pressure Hull' })).toBeVisible();
  const meta = page.getByTestId('detail-meta');
  await expect(meta).toContainText('2024');
  await expect(meta).toContainText(/Ends at/);
  const actions = page.getByRole('group', { name: 'Actions' });
  await expect(actions.getByRole('button', { name: /^(Play|Resume)$/ }).first()).toBeVisible();
  for (const name of ['Mark played', 'Add to favorites', 'More']) {
    await expect(actions.getByRole('button', { name, exact: true })).toBeVisible();
  }

  // Version, video and audio selects for a video.
  await expect(page.getByTestId('track-selections').getByLabel('Audio')).toBeVisible();

  // The NFO's tagline, overview, director, studio, genre and cast (seeded by the harness).
  if (await page.getByTestId('cast').count()) {
    await expect(page.getByTestId('detail-overview')).toContainText('cracked hull');
    const group = page.getByTestId('detail-group');
    await expect(group).toContainText('Director');
    await expect(group).toContainText('Ada Marsh');
    await expect(page.getByTestId('cast').getByTestId('person-card').first()).toContainText('Ivo Trench');
    await page.screenshot({ path: `${EVIDENCE}11-details.png`, fullPage: true });

    // A cast card opens the person's page with their movies.
    await page.getByTestId('cast').getByTestId('person-card').filter({ hasText: 'Ivo Trench' }).click();
    await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'Person', { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Ivo Trench' })).toBeVisible();
    await expect(page.getByTestId('person-Movie').getByTestId('item-link')).toContainText(['Pressure Hull']);
    await page.goBack();
  } else {
    test.info().annotations.push({ type: 'finding', description: 'NFO people not read: no Cast & Crew section' });
  }

  // More (…): the admin sees jellyfin-web's entries, in its order.
  await page.getByTestId('action-more').click();
  const menu = page.getByTestId('more-menu');
  for (const name of ['Add to collection', 'Add to playlist', 'Media Info', 'Refresh metadata']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${EVIDENCE}12-more-menu.png` });

  // Media Info lists the container and the streams; Escape closes it.
  await menu.getByRole('menuitem', { name: 'Media Info' }).click();
  const info = page.getByTestId('media-info-dialog');
  await expect(info).toContainText('Container');
  await expect(info).toContainText('Video');
  await page.keyboard.press('Escape');
  await expect(info).toHaveCount(0);

  // Refresh metadata opens jellyfin-web's dialog; Back closes it without a refresh.
  await page.getByTestId('action-more').click();
  await page.getByTestId('more-menu').getByRole('menuitem', { name: 'Refresh metadata' }).click();
  const refresh = page.getByTestId('refresh-dialog');
  await expect(refresh.getByLabel('Refresh mode')).toHaveValue('scan');
  await refresh.getByRole('button', { name: 'Back' }).click();
  await expect(refresh).toHaveCount(0);
});

test('details: the audio track chosen on the page carries into the player', async ({ page }) => {
  await signIn(page);
  await openMovie(page, 'Other formats', 'Twin Echo');
  const audio = page.getByTestId('track-selections').getByLabel('Audio');
  await expect(audio.locator('option')).toHaveCount(2);
  // The server remembers the last audio choice as the default: pick the other track.
  const current = await audio.inputValue();
  const values = await audio.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const french = values.find((v) => v !== current)!;
  await audio.selectOption(french);
  const info = page.waitForRequest((r) => /\/PlaybackInfo/.test(r.url()) && r.method() === 'POST');
  await page.getByTestId('action-play').or(page.getByTestId('action-resume')).first().click();
  await expect(page).toHaveURL(new RegExp(`/video\\?id=.*audio=${french}`));
  expect((await info).postDataJSON().AudioStreamIndex).toBe(Number(french));
});

test('details: collection and playlist, add, reorder, remove, delete', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { headers } = await sessionApi(page);
  const voyage = await openMovie(page, 'Movies', 'Voyage to the Trench');

  // Add to collection → New… → the new collection's page lists the movie.
  await page.getByTestId('action-more').click();
  await page.getByTestId('more-menu').getByRole('menuitem', { name: 'Add to collection' }).click();
  const coll = page.getByTestId('collection-dialog');
  await coll.getByLabel('Name').fill('Deep Set');
  await coll.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'BoxSet', { timeout: 15_000 });
  const collectionId = page.url().split('/details?id=')[1]!.split('&')[0]!;
  // Stock Jellyfin links the items some time after it answers. Wait on the
  // server, not on the page, then load the page once.
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${SERVER}/Items?parentId=${collectionId}&limit=1`, { headers });
        return r.ok() ? ((await r.json()) as { TotalRecordCount: number }).TotalRecordCount : 0;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('collection-items')).toContainText('Movies', { timeout: 15_000 });
  await expect(page.getByTestId('collection-items').getByTestId('item-link')).toContainText(['Voyage to the Trench']);
  await expect(page.getByTestId('action-play')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}13-collection.png`, fullPage: true });

  // Add to playlist → New… → the playlist page; a second item comes in through the API.
  await page.goto(`./#/details?id=${voyage}`);
  await page.getByTestId('action-more').click();
  await page.getByTestId('more-menu').getByRole('menuitem', { name: 'Add to playlist' }).click();
  const pl = page.getByTestId('playlist-dialog');
  await pl.getByLabel('Name').fill('Dive Queue');
  await pl.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('item-detail')).toHaveAttribute('data-type', 'Playlist', { timeout: 15_000 });
  const playlistId = page.url().split('/details?id=')[1]!.split('&')[0]!;
  const rows = page.getByTestId('playlist-items').getByTestId('episode-row');
  await expect(rows).toHaveCount(1);
  const pressure = (await (
    await page.request.get(`${SERVER}/Items?recursive=true&includeItemTypes=Movie&searchTerm=Pressure`, { headers })
  ).json()) as { Items: { Id: string }[] };
  await page.request.post(`${SERVER}/Playlists/${playlistId}/Items?ids=${pressure.Items[0]!.Id}`, { headers });
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Voyage to the Trench');

  // Reorder with the keyboard on the drag handle; the server keeps the order.
  await rows.nth(0).getByRole('button', { name: /^Move Voyage/ }).press('ArrowDown');
  await expect(rows.nth(0)).toContainText('Pressure Hull', { timeout: 10_000 });
  await page.reload();
  await expect(rows.nth(1)).toContainText('Voyage to the Trench');
  await page.screenshot({ path: `${EVIDENCE}14-playlist.png`, fullPage: true });

  // Remove from playlist.
  await rows.nth(0).getByTestId('playlist-remove').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Voyage to the Trench');

  // Delete the playlist from its More menu, after the confirmation.
  await page.getByTestId('action-more').click();
  await page.getByTestId('more-menu').getByRole('menuitem', { name: 'Delete' }).click();
  const del = page.getByTestId('delete-dialog');
  await expect(del).toContainText('Are you sure you wish to delete this playlist?');
  await del.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/home$/, { timeout: 15_000 });
  await expect.poll(async () => (await page.request.get(`${SERVER}/Items/${playlistId}`, { headers })).status()).toBe(404);

  await page.request.delete(`${SERVER}/Items/${collectionId}`, { headers });
});

/* ---- dashboard core (#84): home, general, users, libraries, tasks ---- */

/** Opens a dashboard page from the drawer, as an administrator does. */
async function dashboardPage(page: Page, label: string, url: RegExp) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/dashboard');
  await page.getByRole('navigation', { name: 'Dashboard menu' }).getByRole('link', { name: label, exact: true }).click();
  await expect(page).toHaveURL(url);
}

test('dashboard home: server, devices, activity, paths', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/dashboard');
  const server = page.getByTestId('dashboard-server');
  await expect(server).toContainText('Server name');
  await expect(server).toContainText('12.0.0');
  // This browser's own session shows under Devices; sign-ins show under Activity.
  await expect(page.getByTestId('session-card').first()).toBeVisible({ timeout: 15_000 });
  // Deadfin (v0.3.0-rc.6) writes no activity log entries, so its widget stays empty.
  if (process.env.HARNESS_PRODUCT !== 'Deadfin')
    await expect(page.getByTestId('dashboard-activity').locator('li').first()).toBeVisible({ timeout: 15_000 });
  else await expect(page.getByTestId('dashboard-activity')).toContainText('No activity in the last day.');
  await expect(page.getByTestId('dashboard-paths')).toContainText('Transcodes');
  await expect(page.getByRole('button', { name: 'Scan All Libraries' })).toBeEnabled({ timeout: 15_000 });
  // Restart asks first; Cancel leaves the server running.
  await page.getByRole('button', { name: 'Restart' }).click();
  const confirm = page.getByRole('dialog', { name: 'Restart' });
  await expect(confirm).toContainText('Are you sure you wish to restart the server?');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await page.screenshot({
    path: `${EVIDENCE}30-dashboard-home.png`,
    fullPage: true,
  });
});

test('dashboard general: server name saves and reloads', async ({ page }) => {
  await signIn(page);
  await dashboardPage(page, 'General', /#\/dashboard\/settings$/);
  const name = page.getByLabel('Server name');
  await expect(name).toBeVisible();
  const before = await name.inputValue();
  await name.fill('Trench Station');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Server name')).toHaveValue('Trench Station');
  await expect(page.getByLabel('Enable Quick Connect on this server')).toBeChecked();
  await page.screenshot({
    path: `${EVIDENCE}31-dashboard-general.png`,
    fullPage: true,
  });
  await page.getByLabel('Server name').fill(before);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});

test('dashboard users: add, restrict, edit, parental control, delete', async ({ page }) => {
  await signIn(page);
  await dashboardPage(page, 'Users', /#\/dashboard\/users$/);
  await expect(page.getByTestId('user-card').filter({ hasText: 'abyss' })).toBeVisible();

  // Add User: name, password, one library.
  await page.getByTestId('add-user').click();
  await expect(page).toHaveURL(/#\/dashboard\/users\/add$/);
  await page.getByLabel('Name').fill('pilot84');
  await page.getByLabel('Password').fill('pilot-pass-84');
  await page.getByLabel('Enable access to all libraries').uncheck();
  await page.getByLabel('Movies', { exact: true }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/users\/[^/]+\/profile$/);
  await expect(page.getByRole('heading', { name: 'pilot84', level: 1 })).toBeVisible();

  // Access tab keeps the one library.
  await page.getByRole('tab', { name: 'Access' }).click();
  await expect(page).toHaveURL(/\/access$/);
  await expect(page.getByLabel('Enable access to all libraries')).not.toBeChecked();
  await expect(page.getByLabel('Movies', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Archive', { exact: true })).not.toBeChecked();

  // Profile: hide from login screens; Save returns to the list.
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByLabel('Hide this user from login screens').check();
  await page.getByLabel('Allow this user to manage collections').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/dashboard\/users$/);
  await expect(page.getByText('Settings saved.')).toBeVisible();

  // The server has the policy.
  const { headers } = await sessionApi(page);
  const users = (await (await page.request.get(`${SERVER}/Users`, { headers })).json()) as {
    Id: string;
    Name: string;
    Policy: {
      IsHidden: boolean;
      EnableCollectionManagement: boolean;
      EnableAllFolders: boolean;
      BlockUnratedItems: string[];
    };
  }[];
  const pilot = users.find((u) => u.Name === 'pilot84')!;
  expect(pilot.Policy).toMatchObject({
    IsHidden: true,
    EnableCollectionManagement: true,
    EnableAllFolders: false,
  });

  // Password: a mismatch is refused in the page.
  await page.goto(`./#/dashboard/users/${pilot.Id}/password`);
  await page.getByLabel('New password', { exact: true }).fill('a');
  await page.getByLabel('New password confirm').fill('b');
  await page.getByRole('button', { name: 'Save Password' }).click();
  await expect(page.getByText('Password and password confirmation must match.')).toBeVisible();
  await page.screenshot({
    path: `${EVIDENCE}32-dashboard-user.png`,
    fullPage: true,
  });

  // Delete from the card menu.
  await page.goto('./#/dashboard/users');
  await page.getByRole('button', { name: 'Menu for pilot84' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete pilot84' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('user-card').filter({ hasText: 'pilot84' })).toHaveCount(0);
});

test('dashboard users: parental control blocks unrated items', async ({ page }) => {
  // The contract sends UnratedItem as strings ("Movie"); Deadfin's
  // UserPolicy.BlockUnratedItems is []int and answers 400.
  test.fail(process.env.HARNESS_PRODUCT === 'Deadfin', 'Deadfin UserPolicy.BlockUnratedItems takes integers, not UnratedItem strings');
  await signIn(page);
  const { headers } = await sessionApi(page);
  const made = await page.request.post(`${SERVER}/Users/New`, { headers, data: { Name: 'warden84', Password: 'warden-pass-84' } });
  expect(made.ok()).toBe(true);
  const id = ((await made.json()) as { Id: string }).Id;
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`./#/dashboard/users/${id}/parentalcontrol`);
    await page.getByLabel('Movies', { exact: true }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();
    const after = (await (await page.request.get(`${SERVER}/Users/${id}`, { headers })).json()) as {
      Policy: { BlockUnratedItems: string[] };
    };
    expect(after.Policy.BlockUnratedItems).toEqual(['Movie']);
  } finally {
    await page.request.delete(`${SERVER}/Users/${id}`, { headers });
  }
});

test('dashboard libraries: add with the folder browser, manage, scan, remove', async ({ page }) => {
  await signIn(page);
  await dashboardPage(page, 'Libraries', /#\/dashboard\/libraries$/);
  const cards = page.getByTestId('library-card');
  await expect(cards.filter({ hasText: 'Archive' })).toBeVisible();
  await expect(cards.filter({ hasText: 'Shows' })).toContainText('Shows');

  // Add Media Library: content type, name, a folder picked in the browser.
  await page.getByRole('button', { name: '+ Add Media Library' }).click();
  const editor = page.getByRole('dialog', { name: 'Add Media Library' });
  await editor.getByLabel('Content type').selectOption('homevideos');
  await editor.getByLabel('Display name').fill('Dive Photos');
  await editor.getByRole('button', { name: 'Add folder' }).click();
  const picker = page.getByRole('dialog', { name: 'Select Path' });
  await picker.getByRole('button', { name: '▸ media' }).click();
  await picker.getByRole('button', { name: '▸ photos' }).click();
  await expect(picker.getByText('/media/photos')).toBeVisible();
  await picker.getByRole('button', { name: 'use this folder' }).click();
  await expect(editor.getByTestId('library-folders')).toContainText('/media/photos');
  await expect(editor.getByLabel('Display the photos')).toBeChecked();
  await editor.getByLabel('Enable real time monitoring').uncheck();
  await page.screenshot({
    path: `${EVIDENCE}33-dashboard-library-add.png`,
    fullPage: true,
  });
  await editor.getByRole('button', { name: 'OK' }).click();
  await expect(editor).toBeHidden({ timeout: 15_000 });
  const card = cards.filter({ hasText: 'Dive Photos' });
  await expect(card).toContainText('Home Videos and Photos');

  // Manage library: the saved option comes back; change one and save.
  await card.getByRole('button', { name: 'Manage library Dive Photos' }).click();
  const manage = page.getByRole('dialog', { name: 'Dive Photos' });
  await expect(manage.getByLabel('Enable real time monitoring')).not.toBeChecked();
  await manage.getByLabel('Enable real time monitoring').check();
  await manage.getByRole('button', { name: 'OK' }).click();
  await expect(manage).toBeHidden();
  const { headers } = await sessionApi(page);
  const folders = (await (await page.request.get(`${SERVER}/Library/VirtualFolders`, { headers })).json()) as {
    Name: string;
    Locations: string[];
    LibraryOptions: { EnableRealtimeMonitor: boolean };
  }[];
  const dive = folders.find((f) => f.Name === 'Dive Photos')!;
  expect(dive.Locations).toEqual(['/media/photos']);
  expect(dive.LibraryOptions.EnableRealtimeMonitor).toBe(true);

  // Scan library from the card menu.
  await card.getByRole('button', { name: 'Menu for Dive Photos' }).click();
  await page.getByRole('menuitem', { name: 'Scan library' }).click();
  const scan = page.getByRole('dialog', { name: 'Scan library' });
  await scan.getByRole('button', { name: 'Refresh' }).click();
  await expect(scan.getByText('Refresh queued.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(scan).toBeHidden();

  // Remove it again.
  await card.getByRole('button', { name: 'Menu for Dive Photos' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  const remove = page.getByRole('dialog', { name: 'Remove Media Folder' });
  await expect(remove).toContainText('/media/photos');
  await remove.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
});

test('dashboard scheduled tasks: categories, run, trigger add and remove', async ({ page }) => {
  await signIn(page);
  await dashboardPage(page, 'Scheduled Tasks', /#\/dashboard\/tasks$/);
  await expect(page.getByRole('heading', { name: 'Library', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maintenance', level: 2 })).toBeVisible();
  const row = page.getByTestId('task-row').filter({ hasText: 'Clean Activity Log' });
  await row.getByRole('button', { name: 'Start Clean Activity Log' }).click();
  // A short task finishes within the poll; its status line then shows the run.
  await expect(row).toContainText(/Last ran (less than a minute|1 minute) ago/, { timeout: 30_000 });
  await page.screenshot({
    path: `${EVIDENCE}34-dashboard-tasks.png`,
    fullPage: true,
  });

  await row.getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Clean Activity Log', level: 1 })).toBeVisible();
  const triggers = page.getByTestId('task-triggers').locator('tbody tr');
  const count = await triggers.count();
  await page.getByRole('button', { name: '+ Add Trigger' }).click();
  const add = page.getByRole('dialog', { name: 'Add Trigger' });
  await add.getByLabel('Trigger type').selectOption('IntervalTrigger');
  await add.getByLabel('Every').selectOption({ label: '6 hours' });
  await add.getByRole('button', { name: 'Add' }).click();
  await expect(triggers).toHaveCount(count + 1);
  await expect(triggers.last()).toContainText('Every 6 hours');
  await triggers.last().getByRole('button', { name: 'Remove Every 6 hours' }).click();
  await page.getByRole('dialog', { name: 'Delete Task Trigger' }).getByRole('button', { name: 'Remove' }).click();
  await expect(triggers).toHaveCount(count);
});

test('dashboard NFO settings: save and reload', async ({ page }) => {
  await signIn(page);
  const { headers } = await sessionApi(page);
  const probe = await page.request.get(`${SERVER}/System/Configuration/xbmcmetadata`, { headers });
  // Deadfin answers 404 until deadfin#741 ships in the image under test.
  test.skip(probe.status() === 404, 'server has no /System/Configuration/xbmcmetadata (deadfin#741)');
  await page.goto('./#/dashboard/libraries/nfo');
  const box = page.getByLabel('Save image paths within NFO files');
  await expect(box).toBeVisible();
  const was = await box.isChecked();
  await box.setChecked(!was);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Save image paths within NFO files')).toBeChecked({ checked: !was });
  await page.getByLabel('Save image paths within NFO files').setChecked(was);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});

test('dashboard: a non-administrator is sent Home', async ({ page }) => {
  // The browser signs abyss out below, so the API calls use their own token.
  const auth = 'MediaBrowser Client="Deadfin Accept", Device="pw", DeviceId="pw-admin84", Version="0.1.0"';
  const login = await page.request.post(`${SERVER}/Users/AuthenticateByName`, {
    headers: { Authorization: auth },
    data: { Username: 'abyss', Pw: 'trench-test-1' },
  });
  const headers = { Authorization: `${auth}, Token="${((await login.json()) as { AccessToken: string }).AccessToken}"` };
  // A run that stopped half way leaves the user behind; start clean.
  const users = (await (await page.request.get(`${SERVER}/Users`, { headers })).json()) as { Id: string; Name: string }[];
  for (const u of users.filter((x) => x.Name === 'deckhand84')) await page.request.delete(`${SERVER}/Users/${u.Id}`, { headers });
  const made = await page.request.post(`${SERVER}/Users/New`, { headers, data: { Name: 'deckhand84', Password: 'deck-pass-84' } });
  expect(made.ok()).toBe(true);
  const id = ((await made.json()) as { Id: string }).Id;
  try {
    await page.goto('./#/login');
    await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
    await page.getByLabel('Server').fill(SERVER);
    await page.getByLabel('User').fill('deckhand84');
    await page.getByLabel('Password').fill('deck-pass-84');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/#\/home$/);
    await page.getByTestId('user-menu-button').click();
    await expect(page.getByRole('menuitem', { name: 'Dashboard' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('./#/dashboard/users');
    await expect(page).toHaveURL(/#\/home$/);
  } finally {
    expect((await page.request.delete(`${SERVER}/Users/${id}`, { headers })).ok()).toBe(true);
  }
});
