import type { Api } from '../client';
import type { components } from '../schema';

/**
 * Transcode workers (Deadfin D-118): the native administrator API under
 * `/deadfin/v1/transcode-workers` (deadfin#615, #616, #617). The contract
 * has no such paths, so these calls go through the typed client untyped:
 * the client still adds the Authorization header and ends the session on a
 * 401.
 */
export const WORKERS_PATH = '/deadfin/v1/transcode-workers';

export type InputMode = 'shared' | 'stream' | 'auto';
export const INPUT_MODES: readonly (readonly [InputMode, string])[] = [
  ['auto', 'Auto'],
  ['shared', 'Shared mount'],
  ['stream', 'Stream from the server'],
];

export type PlacementMode = 'local' | 'local-first' | 'workers-first' | 'workers-only';
export const PLACEMENT_MODES: readonly (readonly [PlacementMode, string])[] = [
  ['local', 'Local: every transcode runs on the server'],
  ['local-first', 'Local first: workers take the jobs past the local limit'],
  ['workers-first', 'Workers first: the server runs a job when no worker fits'],
  ['workers-only', 'Workers only: a job waits for a worker'],
];

export interface WorkerCapabilities {
  HwAccels: string[] | null;
  Encoders: string[] | null;
  FfmpegVersion: string;
  MaxJobs: number;
}

export interface TranscodeWorker {
  Id: string;
  Name: string;
  /** A worker with a token from the server environment: no stored identity, so no edit or revoke. */
  Static?: boolean;
  JoinTokenId: string;
  InputMode: string;
  Pools: string[] | null;
  Connected: boolean;
  Created: string;
  LastSeen: string;
  Revoked?: string;
  /** Set while the worker is connected. */
  Capabilities?: WorkerCapabilities;
  ActiveJobs: number;
}

export interface WorkerUpdate {
  Name?: string;
  InputMode?: InputMode;
  Pools?: string[];
}

export interface JoinToken {
  Id: string;
  Name: string;
  Fingerprint: string;
  Expires?: string;
  UsesLeft?: number;
  Created: string;
  Revoked?: string;
  Usable: boolean;
}

/** Without ExpiresInSeconds the token does not expire; without Uses it has no use limit. */
export interface NewJoinToken {
  Name: string;
  ExpiresInSeconds?: number;
  Uses?: number;
  Fingerprint?: string;
}

/** The create answer: the token row and the token string. The server keeps no copy of `Token`. */
export type CreatedJoinToken = JoinToken & { Token: string };

export interface PolicyMatch {
  SourceCodec?: string[] | null;
  SourceProfile?: string[] | null;
  BitDepthMin?: number;
  BitDepthMax?: number;
  Hdr?: string[] | null;
  NeedsToneMap?: boolean | null;
  TargetCodec?: string[] | null;
}

export interface PolicyRule {
  Name?: string;
  Match: PolicyMatch;
  Pools?: string[] | null;
  Local?: boolean;
  QueueTimeoutSeconds?: number | null;
  CpuFallback?: boolean | null;
}

/** The placement policy (#616). Null QueueTimeoutSeconds is the server default (10 s); null CpuFallback is on. */
export interface PlacementPolicy {
  Mode: PlacementMode;
  DefaultPools: string[] | null;
  LocalLimit: number;
  QueueTimeoutSeconds: number | null;
  CpuFallback: boolean | null;
  Strategy: 'pack' | 'spread';
  Rules: PolicyRule[] | null;
  /** Warm capacity per pool for the scaling signals; "*" is the whole fleet. */
  WarmSlots: Record<string, number> | null;
  /** Set only in the save answer, for example a pool that no worker carries. */
  Warnings?: string[];
}

type Answer = { data?: unknown; error?: unknown; response: Response };
type Init = { body?: unknown };
/** The client without its contract types, for the native paths. */
interface NativeApi {
  GET(path: string, init?: Init): Promise<Answer>;
  POST(path: string, init?: Init): Promise<Answer>;
  PUT(path: string, init?: Init): Promise<Answer>;
  DELETE(path: string, init?: Init): Promise<Answer>;
}

/** The server's problem detail, else the HTTP status. */
function failure(step: string, error: unknown, response: Response): Error {
  const detail = (error as components['schemas']['ProblemDetails'] | undefined)?.detail;
  if (response.status === 404 && !detail) return new Error(`${step} failed: this server has no transcode workers (HTTP 404).`);
  return new Error(detail ? `${step} failed: ${detail}` : `${step} failed (HTTP ${response.status}).`);
}

async function call<T>(api: Api, step: string, method: keyof NativeApi, path: string, body?: unknown): Promise<T> {
  const native = api as unknown as NativeApi;
  const { data, error, response } = await native[method](WORKERS_PATH + path, body === undefined ? undefined : { body });
  if (error !== undefined || !response.ok) throw failure(step, error, response);
  return data as T;
}

const segment = (id: string) => `/${encodeURIComponent(id)}`;

export async function fetchWorkers(api: Api): Promise<TranscodeWorker[]> {
  return (await call<TranscodeWorker[] | null>(api, 'Reading the workers', 'GET', '')) ?? [];
}

/** Changes the operator-owned fields; a field left out keeps its value. */
export async function updateWorker(api: Api, id: string, update: WorkerUpdate): Promise<void> {
  await call(api, 'Saving the worker', 'POST', segment(id), update);
}

/** Revokes the identity and disconnects the worker; its running jobs restart elsewhere. */
export async function revokeWorker(api: Api, id: string): Promise<void> {
  await call(api, 'Revoking the worker', 'DELETE', segment(id));
}

export async function fetchJoinTokens(api: Api): Promise<JoinToken[]> {
  return (await call<JoinToken[] | null>(api, 'Reading the join tokens', 'GET', '/join-tokens')) ?? [];
}

export async function createJoinToken(api: Api, request: NewJoinToken): Promise<CreatedJoinToken> {
  return call<CreatedJoinToken>(api, 'Creating the join token', 'POST', '/join-tokens', request);
}

/** Revokes a join token. Workers it enrolled stay. */
export async function revokeJoinToken(api: Api, id: string): Promise<void> {
  await call(api, 'Revoking the join token', 'DELETE', `/join-tokens${segment(id)}`);
}

export async function fetchPins(api: Api): Promise<string[]> {
  return (await call<{ Fingerprints: string[] | null }>(api, 'Reading the pins', 'GET', '/pins')).Fingerprints ?? [];
}

export async function savePins(api: Api, fingerprints: string[]): Promise<void> {
  await call(api, 'Saving the pins', 'PUT', '/pins', { Fingerprints: fingerprints });
}

export async function fetchPolicy(api: Api): Promise<PlacementPolicy> {
  return call<PlacementPolicy>(api, 'Reading the placement policy', 'GET', '/policy');
}

/** Saves the policy; the answer is the normalized policy with its warnings. */
export async function savePolicy(api: Api, policy: PlacementPolicy): Promise<PlacementPolicy> {
  const { Warnings: _, ...body } = policy;
  return call<PlacementPolicy>(api, 'Saving the placement policy', 'PUT', '/policy', body);
}

/** Creates or rotates the scaling token; the answer is the only copy. */
export async function createScalingToken(api: Api): Promise<string> {
  return (await call<{ Token: string }>(api, 'Creating the scaling token', 'POST', '/scaling-token')).Token;
}

export async function deleteScalingToken(api: Api): Promise<void> {
  await call(api, 'Deleting the scaling token', 'DELETE', '/scaling-token');
}

/** Pool labels from text: comma or space separated, trimmed, lower case, unique. */
export function parsePools(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0))];
}

/** Fingerprints from text, one per line or comma separated. */
export function parseFingerprints(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((f) => f.trim()).filter((f) => f.length > 0))];
}

/** A base64url SHA-256 (43 characters, no padding), as the server checks. */
export function validFingerprint(f: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(f);
}

/** The worker command line for a new join token. `-insecure` when the server URL is plain http off loopback. */
export function workerCommand(serverUrl: string): string {
  const parts = ['deadfin worker', `-server ${serverUrl}`, '-state-dir /var/lib/deadfin-worker', '-token-file /etc/deadfin/worker.token'];
  if (needsInsecure(serverUrl)) parts.push('-insecure');
  return parts.join(' ');
}

function needsInsecure(serverUrl: string): boolean {
  try {
    const u = new URL(serverUrl);
    if (u.protocol !== 'http:') return false;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    return !(host === 'localhost' || host === '::1' || host.startsWith('127.'));
  } catch {
    return false;
  }
}

/** Plain HTTP on the worker routes (deadfin#664). */
export interface PlainHttp {
  /** The value in effect. */
  AllowPlainHttp: boolean;
  /** The dashboard value. */
  Configured: boolean;
  /** DEADFIN_TRANSCODE_WORKERS_ALLOW_HTTP is set and wins over the dashboard value. */
  SetByEnvironment: boolean;
}

/** The `encoding` configuration field that stores the dashboard value; a save that omits it keeps it. */
export const PLAIN_HTTP_FIELD = 'AllowPlainHttpTranscodeWorkers';

/** GET /deadfin/v1/transcode-workers/plain-http; null on a server before #664 (404). */
export async function fetchPlainHttp(api: Api): Promise<PlainHttp | null> {
  const { data, error, response } = await (api as unknown as NativeApi).GET(`${WORKERS_PATH}/plain-http`);
  if (response.status === 404) return null;
  if (error !== undefined || !response.ok) throw failure('Reading the plain HTTP setting', error, response);
  return data as PlainHttp;
}
