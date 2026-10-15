/**
 * Third-party license texts that must travel with the bundle. The fonts are
 * under SIL OFL 1.1, which (§2) requires the license with every copy of the
 * font files, so dist/ — and the assets image built from it — carries
 * dist/licenses/<package>/LICENSE plus an index.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Packages whose files are copied verbatim into dist/ and need their license next to them. */
export const BUNDLED_FILE_PACKAGES = /^@fontsource\//;

export interface LicenseFile {
  fileName: string;
  source: string;
}

export function collectLicenses(root: string): LicenseFile[] {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const names = Object.keys(pkg.dependencies ?? {})
    .filter((n) => BUNDLED_FILE_PACKAGES.test(n))
    .sort();
  const files: LicenseFile[] = [];
  const index: string[] = [];
  for (const name of names) {
    const dir = join(root, 'node_modules', name);
    let text: string;
    let meta: { version?: string; license?: string };
    try {
      text = readFileSync(join(dir, 'LICENSE'), 'utf8');
      meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as typeof meta;
    } catch (err) {
      throw new Error(`license text for bundled package ${name} not found in ${dir}: ${String(err)}`);
    }
    files.push({ fileName: `licenses/${name}/LICENSE`, source: text });
    index.push(`${name} ${meta.version ?? '?'} — ${meta.license ?? 'see LICENSE'} — ${name}/LICENSE`);
  }
  files.push({
    fileName: 'licenses/README.txt',
    source:
      'Third-party files bundled with deadfin-web and their licenses.\n' +
      'deadfin-web itself is GPL-2.0-only (see LICENSE in the source repository).\n\n' +
      index.join('\n') +
      '\n',
  });
  return files;
}

export function licensesPlugin(root: string): Plugin {
  return {
    name: 'deadfin-licenses',
    apply: 'build',
    generateBundle() {
      for (const f of collectLicenses(root)) {
        this.emitFile({ type: 'asset', fileName: f.fileName, source: f.source });
      }
    },
  };
}
