import { describe, expect, it } from 'vitest';
import {
  parseWebBuild,
  clientVersion,
  describeWebBuild,
  FALLBACK_WEB_BUILD,
  type WebBuild,
} from '../src/build';
import { resolveBuildMetadata, type BuildInputs } from '../tools/build-metadata';

const SHA = 'a'.repeat(40);

const VALID_RELEASE: WebBuild = {
  version: '0.2.3',
  commit: SHA,
  qualifier: '',
  builtAt: '2023-11-14T22:13:20Z',
};

const VALID_DEV: WebBuild = {
  version: '0.0.0-dev',
  commit: SHA,
  qualifier: 'dev.untagged',
  builtAt: '',
};

const CV = /^[0-9A-Za-z.+-]+$/;

describe('parseWebBuild — valid input', () => {
  it('accepts a valid release', () => {
    expect(parseWebBuild(VALID_RELEASE)).toEqual(VALID_RELEASE);
  });

  it('accepts a valid rc', () => {
    const rc = { ...VALID_RELEASE, version: '0.3.0-rc.1' };
    expect(parseWebBuild(rc)).toEqual(rc);
    expect(clientVersion(rc)).toBe('0.3.0-rc.1');
  });

  it('rejects an rc version with a non-empty qualifier', () => {
    const rc = { ...VALID_RELEASE, version: '0.3.0-rc.1', qualifier: 'dev.dirty' };
    expect(parseWebBuild(rc)).toEqual(FALLBACK_WEB_BUILD);
  });

  it('accepts a valid dev build', () => {
    expect(parseWebBuild(VALID_DEV)).toEqual(VALID_DEV);
  });

  it('accepts the unknown fallback shape', () => {
    expect(parseWebBuild({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.unknown', builtAt: '' }))
      .toEqual({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.unknown', builtAt: '' });
  });
});

describe('parseWebBuild — rejects invalid input to the explicit fallback', () => {
  it('rejects a quote in the version', () => {
    expect(parseWebBuild({ ...VALID_RELEASE, version: '0.2.3"' })).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects a control character in the commit', () => {
    expect(
      parseWebBuild({ version: '0.0.0-dev', commit: 'x\x01' + 'y'.repeat(38), qualifier: 'dev.unknown', builtAt: '' }),
    ).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects a non-vocabulary qualifier token', () => {
    expect(
      parseWebBuild({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.bogus', builtAt: '' }),
    ).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects a release version with a non-empty qualifier', () => {
    expect(parseWebBuild({ version: '0.2.3', commit: SHA, qualifier: 'dev.x', builtAt: '' })).toEqual(
      FALLBACK_WEB_BUILD,
    );
  });

  it('rejects a dev version with an empty qualifier (must carry tokens)', () => {
    expect(parseWebBuild({ version: '0.0.0-dev', commit: 'unknown', qualifier: '', builtAt: '' })).toEqual(
      FALLBACK_WEB_BUILD,
    );
  });

  it('rejects undefined', () => {
    expect(parseWebBuild(undefined)).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects null', () => {
    expect(parseWebBuild(null)).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects a string', () => {
    expect(parseWebBuild('hello')).toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects a non-40-hex commit that is not unknown', () => {
    expect(parseWebBuild({ version: '0.0.0-dev', commit: 'short', qualifier: 'dev.unknown', builtAt: '' }))
      .toEqual(FALLBACK_WEB_BUILD);
  });

  it('rejects an invalid calendar date in builtAt (Feb 30)', () => {
    expect(
      parseWebBuild({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.unknown', builtAt: '2023-02-30T00:00:00Z' }),
    ).toEqual(FALLBACK_WEB_BUILD);
  });
});

describe('clientVersion', () => {
  it('returns the bare version for a release', () => {
    expect(clientVersion(VALID_RELEASE)).toBe('0.2.3');
    expect(CV.test(clientVersion(VALID_RELEASE))).toBe(true);
  });

  it('returns version+qualifier.g<short> for a dev build', () => {
    const cv = clientVersion(VALID_DEV);
    expect(cv).toBe(`0.0.0-dev+dev.untagged.g${SHA.slice(0, 12)}`);
    expect(CV.test(cv)).toBe(true);
  });

  it('handles unknown commit in the dev suffix', () => {
    const cv = clientVersion({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.unknown', builtAt: '' });
    expect(cv).toBe('0.0.0-dev+dev.unknown.gunknown');
    expect(CV.test(cv)).toBe(true);
  });
});

describe('describeWebBuild', () => {
  it('formats a release', () => {
    expect(describeWebBuild(VALID_RELEASE)).toBe('web 0.2.3 · aaaaaaa');
  });

  it('formats a dev build', () => {
    expect(describeWebBuild(VALID_DEV)).toBe('web 0.0.0-dev+dev.untagged · aaaaaaa');
  });

  it('formats an unknown commit', () => {
    expect(
      describeWebBuild({ version: '0.0.0-dev', commit: 'unknown', qualifier: 'dev.unknown', builtAt: '' }),
    ).toBe('web 0.0.0-dev+dev.unknown · unknown');
  });
});

describe('parseWebBuild — end-to-end dotted ref (train/v0.2.3)', () => {
  it('retains the full qualifier and SHA from the resolver through validation', () => {
    // The required train path contains dots: ref 'train/v0.2.3' sanitizes to
    // 'ref-train-v0.2.3' (dots preserved), so the qualifier is
    // 'dev.ref-train-v0.2.3.untagged'. parseWebBuild must NOT reject the
    // dotted ref- token by splitting it into non-vocabulary fragments.
    const git: BuildInputs['git'] = {
      head: SHA,
      ref: 'train/v0.2.3',
      dirty: false,
      tagCommit: null,
      headTime: 1700000000,
    };
    const resolved = resolveBuildMetadata({ env: {}, git });
    expect(resolved.qualifier).toBe('dev.ref-train-v0.2.3.untagged');
    expect(resolved.commit).toBe(SHA);

    const validated = parseWebBuild(resolved);
    expect(validated).toEqual(resolved);
    expect(validated.qualifier).toBe('dev.ref-train-v0.2.3.untagged');
    expect(validated.commit).toBe(SHA);

    // The full SHA is the one used by both the authorization header and Home readout.
    expect(clientVersion(validated)).toContain(SHA.slice(0, 12));
    expect(describeWebBuild(validated)).toContain(SHA.slice(0, 7));
  });
});
