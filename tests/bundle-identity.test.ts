// @vitest-environment node
import { describe, expect, it, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import {
  resolveBuildMetadata,
  resolveBuildIdentity,
  readBuildEnv,
  probeGit,
} from '../tools/build-metadata';

const TIMEOUT = 120_000;

const NINE_KEYS = [
  'Component',
  'Version',
  'Channel',
  'Revision',
  'Dirty',
  'BuildTime',
  'RequiredAPIVersion',
  'RequiredCapabilities',
  'OptionalCapabilities',
] as const;

interface BundleResult {
  code: string; // all JS chunk text joined
  assets: { fileName: string; source: string | Uint8Array | undefined }[];
}

async function buildBundle(outDir: string): Promise<BundleResult> {
  const result = await build({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, watch: null },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output: { type: string; fileName: string; code?: string; source?: string | Uint8Array }[];
  }[];
  // vite.build with a single config returns exactly one RollupOutput; guard
  // the indexed access for noUncheckedIndexedAccess.
  const first = outputs[0];
  if (!first) throw new Error('vite.build returned no output');
  const output = first.output;
  const code = output
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => (chunk as { code: string }).code)
    .join('\n');
  const assets = output
    .filter((chunk) => chunk.type === 'asset')
    .map((chunk) => ({
      fileName: chunk.fileName,
      source: chunk.source,
    }));
  return { code, assets };
}

describe('bundle identity injection', () => {
  const savedVersion = process.env.DEADFIN_WEB_VERSION;
  afterEach(() => {
    if (savedVersion === undefined) delete process.env.DEADFIN_WEB_VERSION;
    else process.env.DEADFIN_WEB_VERSION = savedVersion;
  });

  it(
    'contains the injected version (0.0.0-dev) and full SHA; advertises no release',
    async () => {
      // Ensure no release version is claimed in this sandbox build.
      delete process.env.DEADFIN_WEB_VERSION;

      const outDir = await mkdtemp(join(tmpdir(), 'deadfin-bundle-'));
      try {
        const { code: bundle } = await buildBundle(outDir);

        // Non-empty: the build produced real JS chunks.
        expect(bundle.length).toBeGreaterThan(0);

        const expected = resolveBuildMetadata({
          env: readBuildEnv(process.env),
          git: probeGit(process.cwd(), undefined),
        });

        // The injected version is present.
        expect(bundle).toContain('0.0.0-dev');

        // The full commit SHA (or "unknown") is present.
        if (expected.commit === 'unknown') {
          // git unavailable in this environment — record that branch.
          expect(bundle).toContain('unknown');
        } else {
          expect(bundle).toContain(expected.commit);
        }

        // The untagged build does not advertise a release: no "version":"X.Y.Z"
        // other than 0.0.0-dev.
        const releaseMatch = bundle.match(/"version":"(\d+\.\d+\.\d+)"/g);
        if (releaseMatch) {
          for (const m of releaseMatch) {
            expect(m).toBe('"version":"0.0.0-dev"');
          }
        }
      } finally {
        await rm(outDir, { recursive: true, force: true });
      }
    },
    TIMEOUT,
  );

  it(
    'emits dist/build.json with the nine pair-contract keys matching the resolved identity',
    async () => {
      delete process.env.DEADFIN_WEB_VERSION;

      const outDir = await mkdtemp(join(tmpdir(), 'deadfin-bundle-pair-'));
      try {
        const { code: bundle, assets } = await buildBundle(outDir);

        // Find the build.json asset emitted beside index.html.
        const buildJsonAsset = assets.find((a) => a.fileName === 'build.json');
        expect(buildJsonAsset).toBeDefined();

        const parsed = JSON.parse(String(buildJsonAsset!.source));

        // Exactly the nine keys in fixed order.
        expect(Object.keys(parsed)).toEqual([...NINE_KEYS]);

        // Deep-equals the pair computed from the same env/git facts.
        const { pair } = resolveBuildIdentity({
          env: readBuildEnv(process.env),
          git: probeGit(process.cwd(), undefined),
        });
        expect(parsed).toEqual(pair);

        // The JS bundle contains the pair's Revision when it is not the
        // null SHA (i.e. when git is available in the sandbox).
        if (pair.Revision !== '0000000000000000000000000000000000000000') {
          expect(bundle).toContain(pair.Revision);
        }
      } finally {
        await rm(outDir, { recursive: true, force: true });
      }
    },
    TIMEOUT,
  );
});
