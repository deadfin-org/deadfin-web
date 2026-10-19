import { describe, expect, it } from 'vitest';
import { detailsUrl, legacyRedirect, paths, videoUrl } from '../src/routes/paths';
import { DASHBOARD_NAV, visibleDashboardNav } from '../src/routes/dashboardNav';
import { dashboardRoutes } from '../src/routes/dashboard';

describe('route paths (jellyfin-web form)', () => {
  it('builds details and video URLs', () => {
    expect(detailsUrl('abc')).toBe('/details?id=abc');
    expect(detailsUrl('abc', { season: 's1' })).toBe('/details?id=abc&season=s1');
    expect(videoUrl('abc')).toBe('/video?id=abc');
    expect(videoUrl('abc', 0)).toBe('/video?id=abc');
    expect(videoUrl('abc', 30_000_000)).toBe('/video?id=abc&t=30000000');
  });

  it.each([
    ['/', '', paths.home],
    ['/item/abc', '', '/details?id=abc'],
    ['/item/abc', '?season=s2', '/details?id=abc&season=s2'],
    ['/play/abc', '?t=42', '/video?id=abc&t=42'],
    ['/play/abc', '', '/video?id=abc'],
    ['/admin/livetv', '', '/dashboard/livetv'],
  ])('redirects old path %s%s', (path, search, want) => {
    expect(legacyRedirect(path, search)).toBe(want);
  });

  it('leaves unknown paths alone', () => {
    expect(legacyRedirect('/nowhere', '')).toBeNull();
  });
});

describe('dashboard drawer', () => {
  it('has the jellyfin-web sections in order', () => {
    expect(DASHBOARD_NAV.map((s) => s.title)).toEqual(['Server', 'Devices', 'Live TV', 'Advanced', 'Plugins']);
  });

  it('shows only registered pages and drops empty sections', () => {
    const nav = visibleDashboardNav(new Set(['', 'livetv']));
    expect(nav.map((s) => [s.title, s.entries.map((e) => e.label)])).toEqual([
      ['Server', ['Dashboard']],
      ['Live TV', ['Live TV']],
    ]);
  });

  it('has a drawer entry for every registered dashboard route', () => {
    const known = new Set(DASHBOARD_NAV.flatMap((s) => s.entries.map((e) => e.path)));
    for (const r of dashboardRoutes) {
      // Detail routes (users/:userId/:tab, tasks/:id …) open from their list page.
      if (r.path.includes(':') || r.path.endsWith('/add')) continue;
      expect(known, r.path).toContain(r.path);
    }
  });
});
