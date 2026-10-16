import { expect, test } from './fixtures';

// Runs against a server nobody has set up (the harness's `fresh` service).
const SERVER = process.env.HARNESS_SERVER ?? 'http://localhost:8099';
const EVIDENCE = (process.env.EVIDENCE_DIR ?? new URL('./evidence', import.meta.url).pathname) + '/';
const AUTH = 'MediaBrowser Client="acceptance", Device="harness", DeviceId="acceptance-setup", Version="0"';

test('first run: the setup wizard takes a new server to a signed-in home', async ({ page, request }) => {
  // The server answers /System/Ping before its startup tasks finish; wait
  // until the wizard endpoints do.
  await expect
    .poll(
      async () => (await request.get(`${SERVER}/Startup/Configuration`, { headers: { Authorization: AUTH } }).catch(() => null))?.status(),
      { timeout: 180_000, intervals: [2_000] },
    )
    .toBe(200);

  await page.goto('./#/login');
  if (process.env.SAME_ORIGIN) {
    // The server that served the app needs setup: straight to the wizard.
    await expect(page).toHaveURL(/#\/setup\?server=/);
  } else {
    await page.getByLabel('server').fill(SERVER);
    await expect(page.getByTestId('setup-needed')).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}01-setup-needed.png` });
    await page.getByRole('link', { name: 'Set it up now' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Server' })).toBeVisible();
  await page.getByLabel('Server name').fill('Trench');
  await page.screenshot({ path: `${EVIDENCE}02-setup-server.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Administrator' })).toBeVisible();
  await page.getByLabel('Username').fill('abyss');
  await page.getByLabel('Password', { exact: true }).fill('trench-test-1');
  await page.getByLabel('Confirm password').fill('trench-test-2');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('setup-error')).toContainText('do not match');
  await page.getByLabel('Confirm password').fill('trench-test-1');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Libraries' })).toBeVisible();
  await page.getByRole('button', { name: 'browse folders…' }).click();
  const picker = page.getByTestId('folder-picker');
  await picker.getByRole('button', { name: '▸ media' }).click();
  await expect(picker.getByText('/media', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: '▸ movies' }).click();
  await picker.getByRole('button', { name: 'use this folder' }).click();
  await expect(page.getByLabel('Folder on the server')).toHaveValue('/media/movies');
  await page.screenshot({ path: `${EVIDENCE}03-setup-library.png`, fullPage: true });
  await page.getByRole('button', { name: 'add library' }).click();
  await expect(page.getByTestId('setup-libraries')).toContainText('Movies — /media/movies');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Remote access' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish and sign in' }).click();

  // Signed in as the new administrator; the scan fills the Movies shelf.
  await expect(page).toHaveURL(/#\/$/, { timeout: 20_000 });
  await expect(page.getByTestId('connection')).toBeVisible();
  // Home loads once; the scan may still be running, so look again until done.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('shelf').first().getByTestId('poster')).toHaveCount(3, { timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000] });
  await page.screenshot({ path: `${EVIDENCE}04-setup-home.png`, fullPage: true });

  // Setup is over: the server says so, and the wizard is not offered again.
  const info = await (await request.get(`${SERVER}/System/Info/Public`)).json();
  expect(info.StartupWizardCompleted).toBe(true);
  expect(info.ServerName).toBe('Trench');
});
