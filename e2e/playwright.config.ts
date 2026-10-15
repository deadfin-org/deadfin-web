import { defineConfig } from '@playwright/test';

// The harness sets PW_BASE_URL: the static app front (http://localhost/) or
// Deadfin's own /web/ (http://localhost:8096/web/). Specs navigate with
// relative URLs ('./#/login') so both resolve. Without PW_BASE_URL (a local
// run against your own server), vite preview serves the app.
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
