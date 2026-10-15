import { describe, expect, it } from 'vitest';
import {
  resolveBuildMetadata,
  readBuildEnv,
  sanitizeRef,
  type BuildInputs,
} from '../tools/build-metadata';

const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);

function git(over: Partial<BuildInputs['git']> = {}): BuildInputs['git'] {
  return {
    head: SHA,
    ref: null,
    dirty: false,
    tagCommit: null,
    headTime: 1700000000,
    ...over,
  };
}

describe('resolveBuildMetadata — release', () => {
  it('claims release when VERSION is finite semver, HEAD is clean, and tag resolves to HEAD', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3' },
      git: git({ tagCommit: SHA }),
    });
    expect(r.version).toBe('0.2.3');
    expect(r.qualifier).toBe('');
    expect(r.commit).toBe(SHA);
    expect(r.builtAt).toBe('2023-11-14T22:13:20Z');
  });
});

describe('resolveBuildMetadata — untagged train', () => {
  it('is 0.0.0-dev with dev.ref-<branch>.untagged when VERSION is unset', () => {
    const r = resolveBuildMetadata({
      env: {},
      git: git({ ref: 'train/v0.2.3' }),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toBe('dev.ref-train-v0.2.3.untagged');
    expect(r.commit).toBe(SHA);
  });
});

describe('resolveBuildMetadata — local unknown / dirty', () => {
  it('has commit unknown and dev.unknown.unverified.untagged when git is all null and env empty', () => {
    const r = resolveBuildMetadata({
      env: {},
      git: { head: null, ref: null, dirty: null, tagCommit: null, headTime: null },
    });
    expect(r.commit).toBe('unknown');
    // dirty: null (git unavailable) records unverified clean state, so the
    // qualifier carries 'unverified' alongside 'unknown' and 'untagged'.
    expect(r.qualifier).toBe('dev.unknown.unverified.untagged');
    expect(r.builtAt).toBe('');
  });

  it('is never a release when dirty, even with a matching tag', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3' },
      git: git({ dirty: true, tagCommit: SHA }),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toContain('dirty');
    expect(r.qualifier).not.toBe('');
  });

  it('is never a release when clean state is unverified (dirty: null), even with a valid matching HEAD and tag', () => {
    // dirty: null means git could not verify the working tree (git unavailable).
    // A verified release requires a verified-clean checkout, so this must NOT
    // claim 0.2.3; it falls back to 0.0.0-dev with a non-empty qualifier that
    // records 'unverified'.
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3' },
      git: git({ dirty: null, tagCommit: SHA }),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toContain('unverified');
    expect(r.qualifier).not.toBe('');
    // The finite version is not advertised as a release identity.
    expect(r.version).not.toBe('0.2.3');
    // HEAD time is used only when dirty === false; null (unverifiable) → empty.
    expect(r.builtAt).toBe('');
  });
});

describe('resolveBuildMetadata — checked-out revision mismatch', () => {
  it('uses git HEAD over env commit and records mismatch; never a release', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3', DEADFIN_WEB_COMMIT: SHA2 },
      git: git({ tagCommit: SHA }),
    });
    expect(r.commit).toBe(SHA); // HEAD wins
    expect(r.qualifier).toContain('mismatch');
    expect(r.version).toBe('0.0.0-dev');
  });
});

describe('resolveBuildMetadata — invalid metadata', () => {
  it('rejects a v-prefixed version as invalid-version', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: 'v0.2.3' },
      git: git(),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toContain('invalid-version');
  });

  it('records tag-mismatch when the tag resolves to a different SHA', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3' },
      git: git({ tagCommit: SHA2 }),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toContain('tag-mismatch');
  });

  it('records tag-unverified when tagCommit is null', () => {
    const r = resolveBuildMetadata({
      env: { DEADFIN_WEB_VERSION: '0.2.3' },
      git: git({ tagCommit: null }),
    });
    expect(r.version).toBe('0.0.0-dev');
    expect(r.qualifier).toContain('tag-unverified');
  });
});

describe('resolveBuildMetadata — builtAt', () => {
  it('uses SOURCE_DATE_EPOCH when it is a non-negative integer', () => {
    const r = resolveBuildMetadata({
      env: { SOURCE_DATE_EPOCH: '1700000000' },
      git: git({ ref: 'main', headTime: 9999999999 }),
    });
    expect(r.builtAt).toBe('2023-11-14T22:13:20Z');
  });
  it('is empty when dirty and no SOURCE_DATE_EPOCH', () => {
    const r = resolveBuildMetadata({
      env: {},
      git: git({ dirty: true }),
    });
    expect(r.builtAt).toBe('');
  });
  it('is empty when dirty: null (unverifiable) even with a valid headTime', () => {
    // Regression: dirty: null pushes 'unverified' not 'dirty', so the old
    // !tokens.includes('dirty') check incorrectly used HEAD time. HEAD
    // committer time is used ONLY when git.dirty === false (verified clean).
    const r = resolveBuildMetadata({
      env: {},
      git: git({ dirty: null, headTime: 1700000000 }),
    });
    expect(r.builtAt).toBe('');
  });

  it('does not crash on a huge SOURCE_DATE_EPOCH (999999999999999)', () => {
    const r = resolveBuildMetadata({
      env: { SOURCE_DATE_EPOCH: '999999999999999' },
      git: git({ ref: 'main', headTime: 1700000000 }),
    });
    // Out of valid Date range → builtAt is empty, not a RangeError.
    expect(r.builtAt).toBe('');
  });

  it('rejects a negative SOURCE_DATE_EPOCH', () => {
    const r = resolveBuildMetadata({
      env: { SOURCE_DATE_EPOCH: '-1' },
      git: git({ ref: 'main', headTime: 1700000000 }),
    });
    // -1 fails /^\d+$/ so SOURCE_DATE_EPOCH is ignored; falls back to headTime.
    expect(r.builtAt).toBe('2023-11-14T22:13:20Z');
  });

  it('rejects a malformed SOURCE_DATE_EPOCH (non-numeric)', () => {
    const r = resolveBuildMetadata({
      env: { SOURCE_DATE_EPOCH: 'abc' },
      git: git({ ref: 'main', headTime: 1700000000 }),
    });
    expect(r.builtAt).toBe('2023-11-14T22:13:20Z');
  });

  it('rejects an out-of-range headTime without crashing', () => {
    const r = resolveBuildMetadata({
      env: {},
      git: git({ ref: 'main', headTime: 999999999999999 }),
    });
    expect(r.builtAt).toBe('');
  });

  it('preserves a valid canonical timestamp near the upper bound', () => {
    // 253402300799 → 9999-12-31T23:59:59Z — the max safe epoch.
    const r = resolveBuildMetadata({
      env: { SOURCE_DATE_EPOCH: '253402300799' },
      git: git({ ref: 'main', headTime: 1700000000 }),
    });
    expect(r.builtAt).toBe('9999-12-31T23:59:59Z');
  });
});

describe('readBuildEnv', () => {
  it('keeps only the three named keys and drops everything else', () => {
    const filtered = readBuildEnv({
      DEADFIN_WEB_VERSION: '1.0.0',
      DEADFIN_WEB_COMMIT: SHA,
      SOURCE_DATE_EPOCH: '1',
      SECRET: 'leak',
      OTHER: 'x',
      PATH: '/bin',
    });
    expect(Object.keys(filtered).sort()).toEqual([
      'DEADFIN_WEB_COMMIT',
      'DEADFIN_WEB_VERSION',
      'SOURCE_DATE_EPOCH',
    ]);
  });
});

describe('sanitizeRef', () => {
  it('replaces disallowed characters with - and caps at 64', () => {
    expect(sanitizeRef('train/v0.2.3')).toBe('train-v0.2.3');
    expect(sanitizeRef('feature/branch')).toBe('feature-branch');
    const long = 'x'.repeat(100);
    expect(sanitizeRef(long)).toHaveLength(64);
  });
});
