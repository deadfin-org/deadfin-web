import { expect, test, type Page } from '@playwright/test';

const SERVER = process.env.HARNESS_SERVER ?? 'http://localhost:8097';
const EVIDENCE = (process.env.EVIDENCE_DIR ?? new URL('./evidence', import.meta.url).pathname) + '/';

async function descend(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('server').fill(SERVER);
  await page.getByLabel('operator').fill('abyss');
  await page.getByLabel('passphrase').fill('trench-test-1');
  await page.getByRole('button', { name: /descend/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('descend: connect → login → home grid renders the library', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'DEADFIN' })).toBeVisible();
  await expect(page.locator('.login-panel')).toHaveCSS('opacity', '1');
  await page.getByLabel('server').fill(SERVER);
  await page.getByLabel('operator').fill('abyss');
  await page.getByLabel('passphrase').fill('trench-test-1');
  await page.screenshot({ path: `${EVIDENCE}01-login.png`, fullPage: true });
  await page.getByRole('button', { name: /descend/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('connection')).toBeVisible();

  // The Movies shelf surfaces with all three seeded movies…
  const moviesShelf = page.getByTestId('shelf').first();
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
  await page.goto('/login');
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
  await expect(page.getByTestId('shelf').first().getByTestId('poster-played')).toHaveCount(1, {
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
  await page.goto('/');
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
