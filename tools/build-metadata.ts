/**
 * Build-time metadata resolver for the web bundle (issue #26, §9(a)).
 *
 * Pure precedence over env + git-probe facts → the single web-owned
 * {version, commit, qualifier, builtAt} object injected by vite `define`.
 * This is an internal build-identity object, NOT a server/pair schema.
 *
 * The same BuildInputs also project to a pair-contract `build.json` (issue #32)
 * via {@link resolveBuildIdentity}, emitted beside index.html by
 * {@link buildJsonPlugin}. Both projections share one probe; no second
 * identity is computed anywhere.
 */
import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';
import type { WebBuild } from '../src/build';

/** Inputs to {@link resolveBuildMetadata}; passed as data so unit tests need no git. */
export interface BuildInputs {
  env: {
    DEADFIN_WEB_VERSION?: string;
    DEADFIN_WEB_COMMIT?: string;
    SOURCE_DATE_EPOCH?: string;
  };
  git: {
    /** 40-hex HEAD SHA, or null when git is unavailable / detached probe fails. */
    head: string | null;
    /** Short branch name, or null on a detached HEAD. */
    ref: string | null;
    /** True when the working tree has tracked OR non-ignored untracked changes; false when verified clean; null when git is unavailable (clean state unverified, blocks a release claim). */
    dirty: boolean | null;
    /** The commit SHA `refs/tags/v<version>` resolves to, or null. */
    tagCommit: string | null;
    /** Committer time of HEAD as a unix epoch (seconds), or null. */
    headTime: number | null;
  };
}

const HEX40 = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
/** A release-candidate version, spelled as deadfin's rc identity: no leading v. */
const RC_VERSION = /^\d+\.\d+\.\d+-rc\.[1-9]\d*$/;
const REF_ALLOWED = /[A-Za-z0-9._-]/;

/** Sanitize a ref name into a qualifier token: disallowed chars → `-`, capped at 64. */
export function sanitizeRef(ref: string): string {
  const cleaned = ref
    .split('')
    .map((c) => (REF_ALLOWED.test(c) ? c : '-'))
    .join('');
  return cleaned.slice(0, 64);
}

/**
 * Parse `git status --porcelain` output into a dirty boolean. Both tracked
 * entries (` M …`/`M  …`) and untracked entries (`?? …`) count as dirt.
 * `null` (git unavailable) → `null`; `''` (clean tree) → `false`.
 * Git already excludes ignored paths (dist/, node_modules/, .env*) from `??`
 * output, so this reports untracked *source*, not ignored build output.
 */
export function parseStatusPorcelain(output: string | null): boolean | null {
  if (output === null) return null;
  return output.trim() !== '';
}

/** Read only the three named env keys — no arbitrary env dump reaches `define`. */
export function readBuildEnv(
  env: Record<string, string | undefined>,
): BuildInputs['env'] {
  return {
    DEADFIN_WEB_VERSION: env.DEADFIN_WEB_VERSION,
    DEADFIN_WEB_COMMIT: env.DEADFIN_WEB_COMMIT,
    SOURCE_DATE_EPOCH: env.SOURCE_DATE_EPOCH,
  };
}

/**
 * Convert a unix epoch (seconds) to an ISO-8601 UTC string without
 * milliseconds. Bounds the epoch to a safe range and validates the
 * resulting date so very large values (e.g. 999999999999999) or
 * malformed inputs never throw RangeError — they return '' instead.
 * Also rejects invalid calendar dates that Date normalizes silently
 * (e.g. Feb 30 rolls to Mar 2); only canonical timestamps survive.
 */
const MAX_EPOCH = 253_402_300_799; // 9999-12-31T23:59:59Z — well within Date range

function isoFromEpoch(epoch: number): string {
  if (!Number.isFinite(epoch) || epoch < 0 || epoch > MAX_EPOCH) return '';
  const ms = epoch * 1000;
  if (!Number.isFinite(ms) || ms < 0) return '';
  const d = new Date(ms);
  // Guard before toISOString(): Invalid Date (NaN) throws RangeError.
  if (isNaN(d.getTime())) return '';
  const iso = d.toISOString();
  // Reject invalid calendar dates: Date normalizes Feb 30 → Mar 2, so
  // verify the produced ISO round-trips back to the same epoch. If Date
  // adjusted the date, the round-trip will differ.
  if (new Date(iso).getTime() !== ms) return '';
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Pure precedence resolution. Every other sentence in the spec defers to the
 * ordering below. Stop at the first rule that decides each field.
 */
export function resolveBuildMetadata(inputs: BuildInputs): WebBuild {
  const { env, git } = inputs;
  const tokens: string[] = ['dev']; // every non-release qualifier starts with dev

  // 1. commit — git HEAD is authoritative over env; event SHA never trusted over checkout.
  let commit = 'unknown';
  const envCommit = env.DEADFIN_WEB_COMMIT;
  if (git.head && HEX40.test(git.head)) {
    commit = git.head;
    if (envCommit && HEX40.test(envCommit) && envCommit !== git.head) {
      tokens.push('mismatch');
    } else if (envCommit !== undefined && envCommit !== '' && !HEX40.test(envCommit)) {
      tokens.push('invalid-commit');
    }
  } else if (envCommit && HEX40.test(envCommit)) {
    commit = envCommit;
  } else {
    tokens.push('unknown');
    if (envCommit !== undefined && envCommit !== '' && !HEX40.test(envCommit)) {
      tokens.push('invalid-commit');
    }
  }

  // 2. dirty — true records tracked OR non-ignored untracked changes; null
  //    means git could not verify the working tree (git unavailable), so
  //    cleanliness is unverified and a release claim is impossible. Both
  //    push an integrity token; only false is clean.
  if (git.dirty === true) {
    tokens.push('dirty');
  } else if (git.dirty === null) {
    tokens.push('unverified');
  }

  // 3. version — release only when finite semver (or X.Y.Z-rc.N) AND no
  //    integrity tokens AND tag resolves to commit. An rc is a verified
  //    tagged build like a release; the pair projection names its channel.
  let version = '0.0.0-dev';
  let isRelease = false;
  const envVersion = env.DEADFIN_WEB_VERSION;
  if (envVersion === undefined || envVersion === '') {
    tokens.push('untagged');
  } else if (!SEMVER.test(envVersion) && !RC_VERSION.test(envVersion)) {
    tokens.push('invalid-version');
  } else {
    const hasIntegrity =
      tokens.includes('mismatch') ||
      tokens.includes('dirty') ||
      tokens.includes('unverified') ||
      tokens.includes('invalid-commit') ||
      !HEX40.test(commit);
    if (hasIntegrity) {
      // not a release; version stays 0.0.0-dev. tag check skipped.
    } else if (git.tagCommit === null) {
      tokens.push('tag-unverified');
    } else if (git.tagCommit !== commit) {
      tokens.push('tag-mismatch');
    } else {
      isRelease = true;
      version = envVersion;
    }
  }

  // 4. ref — non-release only, after dev, before the other produced tokens.
  const refTokens: string[] = [];
  if (!isRelease && git.ref !== null && git.ref !== '') {
    refTokens.push(`ref-${sanitizeRef(git.ref)}`);
  }

  // 5. qualifier — release → ''; otherwise dev.ref? + produced tokens (minus the leading dev already in `tokens`).
  let qualifier = '';
  if (!isRelease) {
    const all = ['dev', ...refTokens, ...tokens.slice(1)];
    qualifier = all.join('.');
  }

  // 6. builtAt — deterministic source only; never Date.now().
  //    HEAD committer time is used ONLY when the probe verified a clean
  //    tree (git.dirty === false). When dirty is true or null (unverifiable),
  //    BuildTime is empty — an unverifiable tree must never claim a release
  //    time.
  let builtAt = '';
  const epoch = env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && epoch !== '' && /^\d+$/.test(epoch) && Number.isFinite(Number(epoch))) {
    builtAt = isoFromEpoch(Number(epoch));
  } else if (git.dirty === false && git.headTime !== null) {
    builtAt = isoFromEpoch(git.headTime);
  }

  return { version, commit, qualifier, builtAt };
}

// ── pair-contract build.json projection (issue #32) ───────────────────────

/** The git null SHA — used as Revision when no 40-hex revision is known. */
const NULL_SHA = '0000000000000000000000000000000000000000';

/**
 * Non-release Channel names mirror the Version-form names in the issue; the
 * release value `release` is given verbatim. These are pinned in one place
 * pending overseer confirmation against deadfin/deadfin@7d3eea2
 * docs/09-release-identity.md §3.2 and tools/releasecheck/pair.go.
 */
export const PAIR_CHANNELS = {
  release: 'release',
  rc: 'rc',
  train: 'train',
  master: 'master',
  local: 'local',
} as const;

/**
 * The nine-key pair-contract object emitted as `dist/build.json`. Key order
 * is fixed; no other keys are emitted.
 */
export interface PairBuildInfo {
  Component: 'deadfin-web';
  Version: string;
  Channel: 'release' | 'rc' | 'train' | 'master' | 'local';
  Revision: string;
  Dirty: boolean;
  BuildTime: string;
  RequiredAPIVersion: 1;
  RequiredCapabilities: readonly ['build-info'];
  OptionalCapabilities: readonly [];
}

const TRAIN_REF = /^train\/v(\d+\.\d+\.\d+)$/;

/**
 * Resolve both the web bundle identity ({@link WebBuild}) and the pair-contract
 * `build.json` object from one {@link BuildInputs}. Calls {@link resolveBuildMetadata}
 * for `web`, then applies the pair precedence (release > train > master > local).
 * No `Date.now()` anywhere; both projections share one set of facts.
 */
export function resolveBuildIdentity(inputs: BuildInputs): {
  web: WebBuild;
  pair: PairBuildInfo;
} {
  const web = resolveBuildMetadata(inputs);
  const { env, git } = inputs;

  // commit — same resolution as resolveBuildMetadata step 1.
  let commit: string | null = null; // null means unknown
  if (git.head && HEX40.test(git.head)) {
    commit = git.head;
  } else if (env.DEADFIN_WEB_COMMIT && HEX40.test(env.DEADFIN_WEB_COMMIT)) {
    commit = env.DEADFIN_WEB_COMMIT;
  }

  // integrity failure — any of the conditions that block a non-local claim.
  const integrityFailure =
    (git.head != null &&
      HEX40.test(git.head) &&
      env.DEADFIN_WEB_COMMIT != null &&
      env.DEADFIN_WEB_COMMIT !== '' &&
      HEX40.test(env.DEADFIN_WEB_COMMIT) &&
      env.DEADFIN_WEB_COMMIT !== git.head) ||
    (env.DEADFIN_WEB_COMMIT != null &&
      env.DEADFIN_WEB_COMMIT !== '' &&
      !HEX40.test(env.DEADFIN_WEB_COMMIT)) ||
    git.dirty === true ||
    git.dirty === null ||
    commit === null;

  // Channel / Version — release|rc > train > master > local.
  let channel: PairBuildInfo['Channel'];
  let version: string;

  if (web.qualifier === '' && RC_VERSION.test(web.version)) {
    // Rule 1, prerelease: a verified vX.Y.Z-rc.N tag. Version carries no
    // leading v, matching deadfin's rc identity (tools/image-publication).
    channel = PAIR_CHANNELS.rc;
    version = web.version;
  } else if (web.qualifier === '') {
    // Rule 1: release — resolveBuildMetadata already verified the full condition.
    channel = PAIR_CHANNELS.release;
    version = 'v' + web.version;
  } else if (!integrityFailure && git.ref != null && TRAIN_REF.test(git.ref)) {
    // Rule 2: train
    channel = PAIR_CHANNELS.train;
    const trainVersion = git.ref.match(TRAIN_REF)?.[1] ?? '';
    version = 'v' + trainVersion + '-dev-' + (commit ?? '').slice(0, 12);
  } else if (!integrityFailure && git.ref === 'master') {
    // Rule 3: master
    channel = PAIR_CHANNELS.master;
    version = 'dev-' + (commit ?? '').slice(0, 12);
  } else {
    // Rule 4: local — any integrity failure, detached HEAD, other branch, missing git.
    channel = PAIR_CHANNELS.local;
    version = '0.0.0-local';
  }

  // Dirty — true when dirty === true OR dirty === null (unverifiable is dirty).
  const dirty = git.dirty === true || git.dirty === null;

  // Revision — commit when known; null SHA under local only.
  const revision = commit !== null ? commit : NULL_SHA;

  // BuildTime — identical to WebBuild.builtAt (already deterministic).
  const buildTime = web.builtAt;

  const pair: PairBuildInfo = {
    Component: 'deadfin-web',
    Version: version,
    Channel: channel,
    Revision: revision,
    Dirty: dirty,
    BuildTime: buildTime,
    RequiredAPIVersion: 1,
    RequiredCapabilities: ['build-info'],
    OptionalCapabilities: [],
  };

  return { web, pair };
}

/**
 * Vite plugin that emits `build.json` beside `index.html` in production output.
 * `apply: 'build'` keeps dev servers (vite/vitest) from emitting.
 */
export function buildJsonPlugin(pair: PairBuildInfo): Plugin {
  return {
    name: 'deadfin-build-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build.json',
        source: JSON.stringify(pair) + '\n',
      });
    },
  };
}

// ── node-only git probe (kept out of the bundle path) ──────────────────────

/** Probe the checkout for build-metadata facts. Each call fails → null. */
export function probeGit(cwd: string, tagVersion?: string): BuildInputs['git'] {
  function run(args: string[]): string | null {
    try {
      return execFileSync('git', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();
    } catch {
      return null;
    }
  }

  const head = run(['rev-parse', 'HEAD']);
  const head40 = head && HEX40.test(head) ? head : null;
  const ref = run(['symbolic-ref', '--short', '-q', 'HEAD']);
  const porcelain = run(['status', '--porcelain', '--untracked-files=normal']);
  const dirty = parseStatusPorcelain(porcelain);
  const headTimeRaw = run(['log', '-1', '--format=%ct']);
  const headTime =
    headTimeRaw === null || !/^\d+$/.test(headTimeRaw) ? null : Number(headTimeRaw);

  // tagCommit only when an env version is present and finite semver or rc.
  let tagCommit: string | null = null;
  if (tagVersion && (SEMVER.test(tagVersion) || RC_VERSION.test(tagVersion))) {
    const tag = run(['rev-parse', '--verify', '-q', `refs/tags/v${tagVersion}^{commit}`]);
    tagCommit = tag && HEX40.test(tag) ? tag : null;
  }

  return { head: head40, ref, dirty, tagCommit, headTime };
}
