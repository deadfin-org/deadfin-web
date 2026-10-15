import { describe, expect, it } from 'vitest';
import {
  resolveBuildIdentity,
  parseStatusPorcelain,
  PAIR_CHANNELS,
  type BuildInputs,
  type PairBuildInfo,
} from '../tools/build-metadata';
import type { WebBuild } from '../src/build';

const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const HEAD_TIME = 1700000000; // 2023-11-14T22:13:20Z

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

const NULL_SHA = '0000000000000000000000000000000000000000';
/** Partial inputs for test fixtures: env props are already optional; git props partialized. */
type PartialInputs = {
  env?: BuildInputs['env'];
  git?: Partial<BuildInputs['git']>;
};

function git(over: Partial<BuildInputs['git']> = {}): BuildInputs['git'] {
  return {
    head: SHA,
    ref: null,
    dirty: false,
    tagCommit: null,
    headTime: HEAD_TIME,
    ...over,
  };
}

function env(over: Partial<BuildInputs['env']> = {}): BuildInputs['env'] {
  return { ...over };
}

function pair(inputs: PartialInputs): PairBuildInfo {
  return resolveBuildIdentity({
    env: env(inputs.env ?? {}),
    git: git(inputs.git ?? {}),
  }).pair;
}

function web(inputs: PartialInputs): WebBuild {
  return resolveBuildIdentity({
    env: env(inputs.env ?? {}),
    git: git(inputs.git ?? {}),
  }).web;
}

// ── invariant assertions shared across fixtures ──────────────────────────

/** Assert the reconciliation invariants between web and pair. */
function assertInvariants(inputs: PartialInputs): void {
  const { web: w, pair: p } = resolveBuildIdentity({
    env: env(inputs.env ?? {}),
    git: git(inputs.git ?? {}),
  });
  // Channel ∈ {release, rc} ⇔ web.qualifier === ''
  expect(p.Channel === 'release' || p.Channel === 'rc').toBe(w.qualifier === '');
  // When release, pair.Version === 'v' + web.version; rc carries no v.
  if (p.Channel === 'release') {
    expect(p.Version).toBe('v' + w.version);
  }
  if (p.Channel === 'rc') {
    expect(p.Version).toBe(w.version);
  }
  // pair.Revision === web.commit whenever web.commit !== 'unknown'
  if (w.commit !== 'unknown') {
    expect(p.Revision).toBe(w.commit);
  }
  // pair.BuildTime === web.builtAt
  expect(p.BuildTime).toBe(w.builtAt);
  // pair.Dirty === (qualifier has 'dirty' || qualifier has 'unverified')
  expect(p.Dirty).toBe(
    w.qualifier.includes('dirty') || w.qualifier.includes('unverified'),
  );
}

// ── parseStatusPorcelain ─────────────────────────────────────────────────

describe('parseStatusPorcelain', () => {
  it('null → null (git unavailable)', () => {
    expect(parseStatusPorcelain(null)).toBeNull();
  });
  it('tracked entry → true', () => {
    expect(parseStatusPorcelain(' M src/build.ts\n')).toBe(true);
  });
  it('untracked entry → true', () => {
    expect(parseStatusPorcelain('?? src/new.ts\n')).toBe(true);
  });
  it('mixed tracked and untracked → true', () => {
    expect(parseStatusPorcelain(' M src/build.ts\n?? src/new.ts\n')).toBe(true);
  });
  it('empty (clean tree) → false', () => {
    expect(parseStatusPorcelain('')).toBe(false);
  });
  it('whitespace-only → false', () => {
    expect(parseStatusPorcelain('\n\n')).toBe(false);
  });
});

// ── keys and types ────────────────────────────────────────────────────────

describe('PairBuildInfo — keys and types', () => {
  it('has exactly the nine keys in fixed order', () => {
    const p = pair({});
    expect(Object.keys(p)).toEqual(NINE_KEYS);
  });

  it('has correct types for each key', () => {
    const p = pair({});
    expect(typeof p.Component).toBe('string');
    expect(typeof p.Version).toBe('string');
    expect(typeof p.Channel).toBe('string');
    expect(typeof p.Revision).toBe('string');
    expect(typeof p.Dirty).toBe('boolean');
    expect(typeof p.BuildTime).toBe('string');
    expect(typeof p.RequiredAPIVersion).toBe('number');
    expect(Array.isArray(p.RequiredCapabilities)).toBe(true);
    expect(Array.isArray(p.OptionalCapabilities)).toBe(true);
  });

  it('Revision matches /^[0-9a-f]{40}$/', () => {
    expect(pair({}).Revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it('RequiredAPIVersion === 1', () => {
    expect(pair({}).RequiredAPIVersion).toBe(1);
  });

  it('RequiredCapabilities === [build-info]', () => {
    expect(pair({}).RequiredCapabilities).toEqual(['build-info']);
  });

  it('OptionalCapabilities === []', () => {
    expect(pair({}).OptionalCapabilities).toEqual([]);
  });

  it('Component is deadfin-web constant', () => {
    expect(pair({}).Component).toBe('deadfin-web');
  });

  it('PAIR_CHANNELS has the five channel names', () => {
    expect(PAIR_CHANNELS).toEqual({
      release: 'release',
      rc: 'rc',
      train: 'train',
      master: 'master',
      local: 'local',
    });
  });
});

// ── release ──────────────────────────────────────────────────────────────

describe('resolveBuildIdentity — release', () => {
  it('claims release when VERSION is finite semver, HEAD clean, tag resolves to HEAD', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { tagCommit: SHA, ref: 'master' },
    });
    expect(p.Channel).toBe('release');
    expect(p.Version).toBe('v0.2.5');
    expect(p.Dirty).toBe(false);
    expect(p.BuildTime).toBe('2023-11-14T22:13:20Z');
    expect(p.Revision).toBe(SHA);
  });

  it('web.version is 0.2.5 and web.qualifier is empty', () => {
    const w = web({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { tagCommit: SHA, ref: 'master' },
    });
    expect(w.version).toBe('0.2.5');
    expect(w.qualifier).toBe('');
  });
});

// ── rc ───────────────────────────────────────────────────────────────────

describe('resolveBuildIdentity — rc', () => {
  it('claims rc when VERSION is X.Y.Z-rc.N, HEAD clean, tag resolves to HEAD', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.3.0-rc.1' },
      git: { tagCommit: SHA, ref: null },
    });
    expect(p.Channel).toBe('rc');
    expect(p.Version).toBe('0.3.0-rc.1');
    expect(p.Dirty).toBe(false);
    expect(p.Revision).toBe(SHA);
  });

  it('web.version is the rc version and web.qualifier is empty', () => {
    const w = web({
      env: { DEADFIN_WEB_VERSION: '0.3.0-rc.1' },
      git: { tagCommit: SHA },
    });
    expect(w.version).toBe('0.3.0-rc.1');
    expect(w.qualifier).toBe('');
  });

  it('an rc whose tag resolves elsewhere is local, not rc', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.3.0-rc.1' },
      git: { tagCommit: SHA2, ref: null },
    });
    expect(p.Channel).toBe('local');
    expect(p.Version).toBe('0.0.0-local');
  });

  it.each(['0.3.0-rc.0', '0.3.0-rc', '0.3.0-rc.01', 'v0.3.0-rc.1', '0.3.0-beta.1'])(
    'rejects %s as invalid-version',
    (v) => {
      const w = web({ env: { DEADFIN_WEB_VERSION: v }, git: { tagCommit: SHA } });
      expect(w.version).toBe('0.0.0-dev');
      expect(w.qualifier).toContain('invalid-version');
    },
  );
});

// ── train ────────────────────────────────────────────────────────────────

describe('resolveBuildIdentity — train', () => {
  it('produces vX.Y.Z-dev-<sha12> with Channel train', () => {
    const p = pair({
      env: {},
      git: { ref: 'train/v0.2.5' },
    });
    expect(p.Channel).toBe('train');
    expect(p.Version).toBe('v0.2.5-dev-' + SHA.slice(0, 12));
    expect(p.Revision).toBe(SHA);
    expect(p.Dirty).toBe(false);
  });
});

// ── master ───────────────────────────────────────────────────────────────

describe('resolveBuildIdentity — master', () => {
  it('produces dev-<sha12> with Channel master', () => {
    const p = pair({
      env: {},
      git: { ref: 'master' },
    });
    expect(p.Channel).toBe('master');
    expect(p.Version).toBe('dev-' + SHA.slice(0, 12));
    expect(p.Revision).toBe(SHA);
    expect(p.Dirty).toBe(false);
  });
});

// ── local ────────────────────────────────────────────────────────────────

describe('resolveBuildIdentity — local', () => {
  it('detached HEAD (ref null) → local', () => {
    const p = pair({ env: {}, git: { ref: null } });
    expect(p.Channel).toBe('local');
    expect(p.Version).toBe('0.0.0-local');
  });

  it('feature branch → local', () => {
    const p = pair({ env: {}, git: { ref: 'feature/foo' } });
    expect(p.Channel).toBe('local');
    expect(p.Version).toBe('0.0.0-local');
  });
});

// ── missing git ──────────────────────────────────────────────────────────

describe('resolveBuildIdentity — missing git', () => {
  const noGit = { head: null, ref: null, dirty: null, tagCommit: null, headTime: null };

  it('all-null git, env empty → local with null SHA, Dirty true, empty BuildTime', () => {
    const p = pair({ env: {}, git: noGit });
    expect(p.Channel).toBe('local');
    expect(p.Revision).toBe(NULL_SHA);
    expect(p.Dirty).toBe(true);
    expect(p.BuildTime).toBe('');
  });

  it('with DEADFIN_WEB_VERSION set it is still not release', () => {
    const p = pair({ env: { DEADFIN_WEB_VERSION: '0.2.5' }, git: noGit });
    expect(p.Channel).not.toBe('release');
    expect(p.Channel).toBe('local');
  });
});

// ── tracked dirt / untracked dirt ─────────────────────────────────────────

describe('resolveBuildIdentity — dirt', () => {
  it('tracked dirt with matching tag and version → local, Dirty true, empty BuildTime', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { dirty: true, tagCommit: SHA },
    });
    expect(p.Channel).toBe('local');
    expect(p.Dirty).toBe(true);
    expect(p.BuildTime).toBe('');
  });

  it('untracked dirt with matching tag and version → local, Dirty true', () => {
    // parseStatusPorcelain confirmed untracked → true; this tests the pair
    // path uses the same dirty: true signal regardless of source.
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { dirty: true, tagCommit: SHA },
    });
    expect(p.Channel).toBe('local');
    expect(p.Dirty).toBe(true);
    expect(p.BuildTime).toBe('');
  });

  it('dirty null (unverifiable) with headTime set → local, Dirty true, empty BuildTime', () => {
    // dirty: null means git could not verify the working tree. Even with a
    // valid headTime, BuildTime must be empty — HEAD committer time is used
    // only when git.dirty === false (verified clean), never when unverifiable.
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { dirty: null, tagCommit: SHA, headTime: HEAD_TIME },
    });
    expect(p.Channel).toBe('local');
    expect(p.Dirty).toBe(true);
    expect(p.BuildTime).toBe('');
  });
});

// ── mismatched SHA / tag ──────────────────────────────────────────────────

describe('resolveBuildIdentity — mismatched SHA / tag', () => {
  it('DEADFIN_WEB_COMMIT differs from HEAD → never release', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5', DEADFIN_WEB_COMMIT: SHA2 },
      git: { tagCommit: SHA },
    });
    expect(p.Channel).not.toBe('release');
    expect(p.Channel).toBe('local');
  });

  it('tagCommit differs from HEAD with version set on train/v0.2.5 → train (not release)', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { tagCommit: SHA2, ref: 'train/v0.2.5' },
    });
    expect(p.Channel).toBe('train');
    expect(p.Channel).not.toBe('release');
  });

  it('tagCommit null with version set → not release', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { tagCommit: null },
    });
    expect(p.Channel).not.toBe('release');
  });
});

// ── malformed values ─────────────────────────────────────────────────────

describe('resolveBuildIdentity — malformed values', () => {
  it('v-prefixed version → not release', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: 'v0.2.5' },
      git: git(),
    });
    expect(p.Channel).not.toBe('release');
  });

  it('incomplete version 0.2 → not release', () => {
    const p = pair({
      env: { DEADFIN_WEB_VERSION: '0.2' },
      git: git(),
    });
    expect(p.Channel).not.toBe('release');
  });

  it('malformed DEADFIN_WEB_COMMIT abc → local', () => {
    const p = pair({
      env: { DEADFIN_WEB_COMMIT: 'abc' },
      git: git(),
    });
    expect(p.Channel).toBe('local');
  });

  it('SOURCE_DATE_EPOCH non-numeric falls back to HEAD time', () => {
    const p = pair({
      env: { SOURCE_DATE_EPOCH: 'now' },
      git: git({ ref: 'master' }),
    });
    expect(p.BuildTime).toBe('2023-11-14T22:13:20Z');
  });

  it('SOURCE_DATE_EPOCH huge value falls back, never throws', () => {
    const p = pair({
      env: { SOURCE_DATE_EPOCH: '999999999999999' },
      git: git({ ref: 'master', headTime: HEAD_TIME }),
    });
    expect(p.BuildTime).toBe('');
  });
});

// ── deterministic time ────────────────────────────────────────────────────

describe('resolveBuildIdentity — deterministic time', () => {
  it('SOURCE_DATE_EPOCH overrides headTime', () => {
    const p = pair({
      env: { SOURCE_DATE_EPOCH: '1700000000' },
      git: git({ ref: 'master', headTime: 9999999999 }),
    });
    expect(p.BuildTime).toBe('2023-11-14T22:13:20Z');
  });

  it('two calls return identical objects (deterministic)', () => {
    const inputs: BuildInputs = {
      env: { SOURCE_DATE_EPOCH: '1700000000' },
      git: git({ ref: 'master' }),
    };
    const a = resolveBuildIdentity(inputs);
    const b = resolveBuildIdentity(inputs);
    expect(a.pair).toEqual(b.pair);
    expect(a.web).toEqual(b.web);
  });

  it('BuildTime === web.builtAt in every case', () => {
    const cases: PartialInputs[] = [
      { env: { DEADFIN_WEB_VERSION: '0.2.5' }, git: { tagCommit: SHA } },
      { env: {}, git: { ref: 'train/v0.2.5' } },
      { env: {}, git: { ref: 'master' } },
      { env: {}, git: { ref: null } },
      { env: { SOURCE_DATE_EPOCH: '1700000000' }, git: { ref: 'master' } },
      { env: {}, git: { dirty: true } },
      { env: {}, git: { dirty: null } },
    ];
    for (const c of cases) {
      const { web: w, pair: p } = resolveBuildIdentity({
        env: env(c.env ?? {}),
        git: git(c.git ?? {}),
      });
      expect(p.BuildTime).toBe(w.builtAt);
    }
  });
});

// ── invariants ───────────────────────────────────────────────────────────

describe('resolveBuildIdentity — reconciliation invariants', () => {
  it('release fixture', () => {
    assertInvariants({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { tagCommit: SHA, ref: 'master' },
    });
  });

  it('rc fixture', () => {
    assertInvariants({
      env: { DEADFIN_WEB_VERSION: '0.3.0-rc.1' },
      git: { tagCommit: SHA, ref: null },
    });
  });

  it('train fixture', () => {
    assertInvariants({ env: {}, git: { ref: 'train/v0.2.5' } });
  });

  it('master fixture', () => {
    assertInvariants({ env: {}, git: { ref: 'master' } });
  });

  it('local (detached) fixture', () => {
    assertInvariants({ env: {}, git: { ref: null } });
  });

  it('missing git fixture', () => {
    assertInvariants({
      env: {},
      git: { head: null, ref: null, dirty: null, tagCommit: null, headTime: null },
    });
  });

  it('dirty fixture', () => {
    assertInvariants({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { dirty: true, tagCommit: SHA },
    });
  });

  it('unverifiable (dirty null) fixture', () => {
    assertInvariants({
      env: { DEADFIN_WEB_VERSION: '0.2.5' },
      git: { dirty: null, tagCommit: SHA },
    });
  });

  it('mismatched commit fixture', () => {
    assertInvariants({
      env: { DEADFIN_WEB_VERSION: '0.2.5', DEADFIN_WEB_COMMIT: SHA2 },
      git: { tagCommit: SHA },
    });
  });

  it('SOURCE_DATE_EPOCH fixture', () => {
    assertInvariants({
      env: { SOURCE_DATE_EPOCH: '1700000000' },
      git: { ref: 'master' },
    });
  });
});
