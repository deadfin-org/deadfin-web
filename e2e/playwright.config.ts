import { defineConfig } from '@playwright/test';

// Stock-jellyfin target: app from vite preview (cross-origin API).
// Deadfin target: app + API same-origin behind the harness nginx —
// PW_BASE_URL points there and no preview server is started.
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:5211';

export default defineConfig({
  testDir: '.',
  testMatch: 'accept.spec.ts',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // Playback tests: allow unmuted autoplay without a gesture chain.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  ...(process.env.PW_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run preview',
          port: 5211,
          reuseExistingServer: true,
        },
      }),
});
