import { expect, test as base } from '@playwright/test';

/**
 * The Playwright test, with one addition: a test fails when the browser
 * reports a Content-Security-Policy violation. The static app front sends
 * the README's CSP (harness/nginx-app.conf), so every passing run proves the
 * app works under it.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
      });
      await use();
      expect(violations, 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from '@playwright/test';
