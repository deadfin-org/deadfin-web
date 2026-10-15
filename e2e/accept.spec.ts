import { expect, test, type Page } from '@playwright/test';

/** A home shelf by library name. */
const shelf = (page: Page, name: string) =>
  page.getByTestId('shelf').filter({ has: page.getByTestId('shelf-link').filter({ hasText: new RegExp(`^${name}$`) }) });

const SERVER = process.env.HARNESS_SERVER ?? 'http://localhost:8097';
const EVIDENCE = (process.env.EVIDENCE_DIR ?? new URL('./evidence', import.meta.url).pathname) + '/';

async function descend(page: Page) {
  await page.goto('./#/login');
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('server').fill(SERVER);
  await page.getByLabel('operator').fill('abyss');
  await page.getByLabel('passphrase').fill('trench-test-1');
  await page.getByRole('button', { name: /descend/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('descend: connect → login → home grid renders the library', async ({ page }) => {
  await page.goto('./#/login');
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('server').fill(SERVER);
  await page.getByLabel('operator').fill('abyss');
  await page.getByLabel('passphrase').fill('trench-test-1');
  await page.screenshot({ path: `${EVIDENCE}01-login.png`, fullPage: true });
  await page.getByRole('button', { name: /descend/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('connection')).toBeVisible();
  // The header names the real server build, not only the compatibility version.
  if (process.env.HARNESS_PRODUCT) {
    await expect(page.getByTestId('server-build')).toContainText(process.env.HARNESS_PRODUCT);
  }
  await page.getByText('about', { exact: true }).click();
  await expect(page.getByTestId('about-server')).toContainText(process.env.HARNESS_PRODUCT ?? '');
  await expect(page.getByTestId('about-web')).toContainText('web ');

  // The Movies shelf surfaces with all three seeded movies…
  const moviesShelf = shelf(page, 'Movies');
  await expect(moviesShelf).toBeVisible({ timeout: 20_000 });
  await expect(moviesShelf.getByTestId('poster')).toHaveCount(3, { timeout: 20_000 });

  // …and at least one real poster image finishes loading.
  await expect(page.locator('.poster-img.is-loaded').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Voyage to the Trench').first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}02-home.png`, fullPage: true });

  // Sign out surfaces back to the login page and drops the session.
  await page.getByRole('button', { name: /surface/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('bad credentials fault visibly, no navigation', async ({ page }) => {
  await page.goto('./#/login');
  await page.getByLabel('server').fill(SERVER);
  await page.getByLabel('operator').fill('abyss');
  await page.getByLabel('passphrase').fill('wrong-passphrase');
  await page.getByRole('button', { name: /descend/i }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: `${EVIDENCE}03-login-fault.png` });
});

test('continue watching, item detail, user-data toggles', async ({ page }) => {
  await descend(page);

  // The seeded in-progress movie surfaces first, with its progress strip.
  const resume = page.getByTestId('resume-shelf');
  await expect(resume).toBeVisible({ timeout: 20_000 });
  await expect(resume.getByTestId('poster')).toHaveCount(1);
  await expect(resume.getByTestId('poster-progress')).toBeVisible();

  // The played movie wears its surfaced badge in the library shelf.
  await expect(shelf(page, 'Movies').getByTestId('poster-played')).toHaveCount(1, {
    timeout: 20_000,
  });
  await page.screenshot({ path: `${EVIDENCE}04-home-userdata.png`, fullPage: true });

  // Into the detail page via the resume card.
  await resume.getByTestId('item-link').click();
  await expect(page).toHaveURL(/\/item\//);
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
});

test('direct play, controls, and server-verified progress reporting', async ({ page }) => {
  await descend(page);

  // Un-watched movie → detail → descend into playback.
  await page.getByText('Pressure Hull').first().click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
  const itemUrl = page.url();
  const itemId = itemUrl.split('/item/')[1]!;
  await page.getByTestId('action-play').click();
  await expect(page).toHaveURL(/\/play\//);

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
  await expect(page).toHaveURL(/\/play\/.*\?t=/);
  await expect
    .poll(async () => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(3.5);
});

test('sign-out ends the server session', async ({ page }) => {
  await descend(page);
  const session = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('deadfin.session.v1')))!,
  ) as { accessToken: string };
  await page.getByRole('button', { name: /surface/i }).click();
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
  await descend(page);
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

test('library page: count, paging past the shelf, sort and filter', async ({ page }) => {
  await descend(page);

  // The home shelf shows the newest 24 and the real total.
  const archive = shelf(page, 'Archive');
  await expect(archive.getByTestId('shelf-count')).toHaveText(/^40 items/, { timeout: 20_000 });
  await expect(archive.getByTestId('poster')).toHaveCount(24);

  await archive.getByTestId('shelf-link').click();
  await expect(page).toHaveURL(/#\/library\//);
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  await expect(page.getByTestId('library-count')).toHaveText('40 items');

  // 40 titles, 36 per page: the second page arrives on scroll or on demand.
  const grid = page.getByTestId('library-grid');
  await expect(grid.getByTestId('poster')).not.toHaveCount(0);
  const more = page.getByTestId('library-more');
  if (await more.isVisible()) await more.click();
  await expect(grid.getByTestId('poster')).toHaveCount(40, { timeout: 15_000 });
  await expect(grid.getByTestId('item-link').first()).toContainText('Archive Reel 01');
  await page.screenshot({ path: `${EVIDENCE}07-library.png`, fullPage: true });

  // Name, descending.
  await page.getByRole('button', { name: /switch to descending/ }).click();
  await expect(grid.getByTestId('item-link').first()).toContainText('Archive Reel 40');
  await expect(page).toHaveURL(/order=desc/);

  // Nothing in this library is played.
  await page.getByLabel('Show').selectOption('played');
  await expect(page.getByTestId('library-empty')).toBeVisible();
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
  await descend(page);
  const { headers, userId, episodes } = await resetEpisodes(page);
  await page.reload();

  // Series card → series page: no Play button for the series itself, seasons as tabs.
  await shelf(page, 'Shows').getByTestId('item-link').first().click();
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
  await shelf(page, 'Shows').getByTestId('item-link').first().click();
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
  await expect(page).toHaveURL(/\/play\//);
  await expect.poll(() => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
});

test('tv: marking an episode played sticks', async ({ page }) => {
  await descend(page);
  await resetEpisodes(page);
  await page.reload();
  await shelf(page, 'Shows').getByTestId('item-link').first().click();
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

  await descend(page);
  await page.getByTestId('quick-connect-link').click();
  await expect(page.getByRole('heading', { name: 'Sign in a device' })).toBeVisible();

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
  await descend(page);
  await page.getByTestId('search-link').click();
  await page.getByLabel('Search').fill('trench');
  await expect(page).toHaveURL(/search\?q=trench/);
  const movies = page.getByTestId('search-group').filter({ hasText: 'Movies' });
  await expect(movies.getByText('Voyage to the Trench')).toBeVisible();
  await expect(movies.getByTestId('poster')).toHaveCount(1);
  await page.screenshot({ path: `${EVIDENCE}09-search.png`, fullPage: true });

  await movies.getByTestId('item-link').click();
  await expect(page).toHaveURL(/\/item\//);
  await expect(page.getByRole('heading', { name: /Voyage to the Trench/ })).toBeVisible();

  // Back keeps the search; a term nothing matches says so.
  await page.goBack();
  await expect(page.getByLabel('Search')).toHaveValue('trench');
  await page.getByLabel('Search').fill('zzqx-nothing');
  await expect(page.getByTestId('search-empty')).toBeVisible();
});

test('transcode: a file the browser cannot decode plays through HLS', async ({ page }) => {
  await descend(page);
  // Deadfin v0.3.0-rc.3 finding: its HLS encoder makes H.264/AAC only, yet
  // PlaybackInfo hands out a TranscodingUrl for the profile's codecs (AV1/Opus
  // for Playwright's Chromium, which has no H.264), and master.m3u8 answers
  // 501. Marked as expected to fail there until the server either encodes the
  // requested codecs or stops offering them; a pass will flag this line.
  const h264 = await page.evaluate(() => MediaSource.isTypeSupported('video/mp4; codecs="avc1.640029"'));
  test.fail(process.env.HARNESS_PRODUCT === 'Deadfin' && !h264, 'Deadfin HLS encodes H.264/AAC only');
  await page.getByTestId('shelf').filter({ hasText: 'Other formats' }).getByTestId('item-link').filter({ hasText: 'Hull Breach' }).click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
  const itemId = page.url().split('/item/')[1]!;
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
  await descend(page);
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
