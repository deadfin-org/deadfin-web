// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLicenses } from '../tools/licenses';

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fixture(deps: Record<string, string>, withLicense: string[]): string {
  root = mkdtempSync(join(tmpdir(), 'licenses-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: deps }));
  for (const name of Object.keys(deps)) {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '5.3.0', license: 'OFL-1.1' }));
    if (withLicense.includes(name)) writeFileSync(join(dir, 'LICENSE'), `license of ${name}`);
  }
  return root;
}

describe('collectLicenses', () => {
  it('emits one LICENSE per fontsource dependency plus an index', () => {
    const r = fixture(
      { '@fontsource/archivo': '^5', '@fontsource/ibm-plex-mono': '^5', react: '^19' },
      ['@fontsource/archivo', '@fontsource/ibm-plex-mono', 'react'],
    );
    const files = collectLicenses(r);
    expect(files.map((f) => f.fileName)).toEqual([
      'licenses/@fontsource/archivo/LICENSE',
      'licenses/@fontsource/ibm-plex-mono/LICENSE',
      'licenses/README.txt',
    ]);
    expect(files[0]!.source).toBe('license of @fontsource/archivo');
    expect(files[2]!.source).toContain('@fontsource/ibm-plex-mono 5.3.0 — OFL-1.1');
  });

  it('fails when a bundled package has no LICENSE', () => {
    const r = fixture({ '@fontsource/archivo': '^5' }, []);
    expect(() => collectLicenses(r)).toThrow(/@fontsource\/archivo/);
  });

  it('covers the real dependencies', () => {
    const names = collectLicenses(process.cwd()).map((f) => f.fileName);
    expect(names).toContain('licenses/@fontsource/archivo/LICENSE');
    expect(names).toContain('licenses/@fontsource/ibm-plex-mono/LICENSE');
  });
});
