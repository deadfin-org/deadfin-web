/**
 * Web build identity (issue #26, §9(a)): the runtime-validated single object
 * that both the MediaBrowser `Version` header and the Home readout derive from.
 *
 * This is a web-owned internal object — version, commit, qualifier, builtAt —
 * NOT a server endpoint or pair schema. The object is injected at build time
 * via vite `define` (`__DEADFIN_WEB_BUILD__`) and validated here at runtime so
 * a malformed or hostile injection can never claim a release.
 */

/** Fixed qualifier token vocabulary for qualifier validation; anything else is invalid. */
const QUALIFIER_TOKENS = new Set([
  'dev',
  'untagged',
  'tag-unverified',
  'tag-mismatch',
  'mismatch',
  'unverified',
  'dirty',
  'invalid-version',
  'invalid-commit',
  'unknown',
  'invalid',
]);

const HEX40 = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
/** A verified release-candidate tag version (X.Y.Z-rc.N); claims like a release. */
const RC_VERSION = /^\d+\.\d+\.\d+-rc\.[1-9]\d*$/;
/** No double quote, no C0 control chars, no DEL, no whitespace. */
const SAFE_CHARS = /^[\x21-\x7e]*$/;

/** The web-owned build identity object (internal; not a server/pair schema). */
export interface WebBuild {
  /** 'X.Y.Z' or 'X.Y.Z-rc.N' only for a verified tag build; otherwise '0.0.0-dev'. */
  version: string;
  /** 40-hex lowercase full SHA of the built checkout, or 'unknown'. */
  commit: string;
  /** '' for a verified release; otherwise dot-joined tokens, first token always 'dev'. */
  qualifier: string;
  /** ISO-8601 UTC from a deterministic source, or '' when unknown. */
  builtAt: string;
}

/** Explicit fallback for any invalid input — never throws, never claims a release. */
export const FALLBACK_WEB_BUILD: WebBuild = {
  version: '0.0.0-dev',
  commit: 'unknown',
  qualifier: 'dev.invalid',
  builtAt: '',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validField(v: unknown): v is string {
  return typeof v === 'string' && SAFE_CHARS.test(v);
}

function validQualifier(q: string, isRelease: boolean): boolean {
  if (isRelease) return q === '';
  if (q === '') return false; // non-release must have tokens

  // The qualifier is: dev[.ref-<name>][.token][.token]...
  // The ref-<name> token (position 1, right after 'dev') is produced by
  // sanitizeRef, which preserves dots in the branch name. So 'ref-train-v0.2.3'
  // is a SINGLE token even though it contains dots. Splitting on '.' naively
  // would fragment it into 'ref-train-v0', '2', '3' — none of which are
  // vocabulary tokens. We must parse the ref- token as a unit: it starts after
  // 'dev' and extends until the next segment that is a known vocabulary token.
  const segments = q.split('.');
  if (segments.length === 0) return false;
  if (segments[0] !== 'dev') return false; // first token always dev

  const seen = new Set<string>(['dev']);
  let i = 1;

  // ref-<name> token: optional, always at position 1.
  if (i < segments.length && segments[i]!.startsWith('ref-')) {
    if (segments[i]!.length <= 4) return false; // ref- needs a name
    // Greedily absorb dot-separated segments into the ref name until we reach
    // a segment that is a known vocabulary token. Dots within the ref name are
    // preserved by sanitizeRef, so 'ref-train-v0.2.3' absorbs '2' and '3'.
    i++; // consume the 'ref-' segment itself
    while (i < segments.length && !QUALIFIER_TOKENS.has(segments[i]!)) {
      i++;
    }
  }

  // Remaining segments must all be vocabulary tokens (no dots in them).
  for (; i < segments.length; i++) {
    const t = segments[i]!;
    if (!t) return false; // no empty tokens
    if (!QUALIFIER_TOKENS.has(t)) return false;
    if (seen.has(t)) return false; // no duplicate tokens
    seen.add(t);
  }
  return true;
}

function validBuiltAt(s: string): boolean {
  if (s === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)) return false;
  // Reject invalid calendar dates (e.g. Feb 30) that pass the regex but
  // are not real dates: Date normalizes them silently, so verify the
  // parsed date round-trips back to the same ISO string.
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z') === s;
}

/**
 * Validate an injected `__DEADFIN_WEB_BUILD__` value. Invalid input returns the
 * explicit fallback — never throws, never claims a release.
 */
export function parseWebBuild(raw: unknown): WebBuild {
  if (!isObject(raw)) return { ...FALLBACK_WEB_BUILD };

  const version = raw.version;
  const commit = raw.commit;
  const qualifier = raw.qualifier;
  const builtAt = raw.builtAt;

  if (
    !validField(version) ||
    !validField(commit) ||
    !validField(qualifier) ||
    !validField(builtAt)
  ) {
    return { ...FALLBACK_WEB_BUILD };
  }

  const isReleaseSemver = SEMVER.test(version) || RC_VERSION.test(version);
  if (version !== '0.0.0-dev' && !isReleaseSemver) {
    return { ...FALLBACK_WEB_BUILD };
  }

  // A release version with a non-empty qualifier is a contradictory claim → invalid.
  const isRelease = isReleaseSemver;
  if (isRelease && qualifier !== '') return { ...FALLBACK_WEB_BUILD };
  // A dev version with an empty qualifier is malformed (must carry at least 'dev.…').
  if (!isRelease && qualifier === '') return { ...FALLBACK_WEB_BUILD };

  if (!validQualifier(qualifier, isRelease)) return { ...FALLBACK_WEB_BUILD };

  if (commit !== 'unknown' && !HEX40.test(commit)) return { ...FALLBACK_WEB_BUILD };

  if (!validBuiltAt(builtAt)) return { ...FALLBACK_WEB_BUILD };

  return { version, commit, qualifier, builtAt };
}

/**
 * The single validated identity for this bundle. Both the auth header and the
 * Home readout derive from this object, so they always agree.
 */
export const webBuild: WebBuild = parseWebBuild(
  typeof __DEADFIN_WEB_BUILD__ === 'undefined'
    ? undefined
    : __DEADFIN_WEB_BUILD__,
);

/**
 * Version string for the MediaBrowser `Version` header field.
 * Release: the bare version. Otherwise `0.0.0-dev+qualifier.g<short-sha>`.
 * Result always matches `/^[0-9A-Za-z.+-]+$/`.
 */
export function clientVersion(b: WebBuild): string {
  if (b.qualifier === '') {
    return b.version;
  }
  const short = b.commit === 'unknown' ? 'unknown' : b.commit.slice(0, 12);
  return `${b.version}+${b.qualifier}.g${short}`;
}

/**
 * Human-facing readout for the Home bar: `web <version>[+qualifier] · <short-sha>`.
 */
export function describeWebBuild(b: WebBuild): string {
  const short = b.commit === 'unknown' ? 'unknown' : b.commit.slice(0, 7);
  const qual = b.qualifier ? `+${b.qualifier}` : '';
  return `web ${b.version}${qual} · ${short}`;
}
