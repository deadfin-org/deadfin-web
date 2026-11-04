import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import type { Api } from '../../../api/client';
import {
  createJoinToken,
  createScalingToken,
  deleteScalingToken,
  fetchJoinTokens,
  fetchPins,
  fetchPlainHttp,
  fetchPolicy,
  fetchWorkers,
  INPUT_MODES,
  parseFingerprints,
  parsePools,
  PLACEMENT_MODES,
  PLAIN_HTTP_FIELD,
  revokeJoinToken,
  revokeWorker,
  savePins,
  savePolicy,
  updateWorker,
  validFingerprint,
  workerCommand,
  type CreatedJoinToken,
  type InputMode,
  type JoinToken,
  type PlacementPolicy,
  type TranscodeWorker,
} from '../../../api/admin/transcodeWorkers';
import { formatDateTime } from '../../../lib/dateTime';
import { CheckboxField } from '../../../ui/Form';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Dialog } from '../../../ui/Modal';
import { PageHeader } from '../../../ui/PageHeader';
import { NumberField, saveNamedConfiguration, SelectField, TextField } from '../settings';
import '../../../ui/table.css';
import '../settings.css';
import './workers.css';

/** Query keys of this page; a change invalidates the whole prefix. */
const KEY = ['admin', 'transcode-workers'] as const;

/** Join token lifetimes, in seconds; 0 never expires. */
const EXPIRY: readonly (readonly [string, string])[] = [
  ['3600', '1 hour'],
  ['86400', '1 day'],
  ['604800', '7 days'],
  ['2592000', '30 days'],
  ['0', 'Never'],
];

/**
 * Dashboard → Playback → Transcode workers (`#/dashboard/playback/workers`,
 * deadfin-web#71): enrolled workers, join tokens, the placement policy,
 * the scaling token and the extra server key pins (Deadfin D-118). The
 * dashboard layout already limits it to administrators.
 */
export function TranscodeWorkers() {
  const { api, session } = useAuth();
  if (!api || !session) return null;
  return (
    <div data-testid="transcode-workers-page">
      <PageHeader title="Transcode Workers" />
      <p className="form-help page-subtitle">
        A transcode worker runs the server's transcodes on another host. It dials out to the server, so the worker host
        needs no open port. With the placement mode Local, every transcode runs on the server.
      </p>
      <Workers api={api} />
      <JoinTokens api={api} serverUrl={session.serverUrl} />
      <Placement api={api} />
      <PlainHttp api={api} />
      <ScalingToken api={api} />
      <Pins api={api} />
    </div>
  );
}

function Section(props: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="workers-section" data-testid={props.testId}>
      <h2 className="workers-title">{props.title}</h2>
      {props.children}
    </section>
  );
}

function ErrorLine(props: { error: Error | null | undefined }) {
  if (!props.error) return null;
  return (
    <p className="form-error" role="alert">
      {props.error.message}
    </p>
  );
}

/** A copyable one-time secret. */
function Secret(props: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(props.value).then(() => setCopied(true));
  };
  return (
    <div className="workers-secret">
      <span className="workers-secret-label">{props.label}</span>
      <code className="workers-secret-value" data-testid={props.testId}>
        {props.value}
      </code>
      <button type="button" className="icon-button" title="Copy" aria-label={`Copy ${props.label.toLowerCase()}`} onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>
  );
}

function workerState(w: TranscodeWorker): string {
  if (w.Revoked) return 'Revoked';
  return w.Connected ? 'Connected' : 'Offline';
}

function inputModeLabel(mode: string): string {
  return INPUT_MODES.find(([v]) => v === mode)?.[1] ?? mode;
}

/** Hardware families, encoders count and ffmpeg version of a connected worker. */
function capabilities(w: TranscodeWorker): string {
  const c = w.Capabilities;
  if (!c) return '';
  const hw = (c.HwAccels ?? []).filter((h) => h && h !== 'none');
  return [hw.length ? hw.join(', ') : 'software', c.FfmpegVersion && `ffmpeg ${c.FfmpegVersion}`].filter(Boolean).join(' · ');
}

function Workers(props: { api: Api }) {
  const { api } = props;
  const queryClient = useQueryClient();
  const workers = useQuery({ queryKey: [...KEY, 'workers'], queryFn: () => fetchWorkers(api), refetchInterval: 10_000 });
  const [editing, setEditing] = useState<TranscodeWorker | null>(null);
  const [revoking, setRevoking] = useState<TranscodeWorker | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => revokeWorker(api, id),
    onSuccess: () => setRevoking(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <Section title="Workers" testId="workers">
      {workers.isError ? (
        <ErrorLine error={workers.error} />
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="workers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>Last seen</th>
                <th>Pools</th>
                <th>Input</th>
                <th>Capabilities</th>
                <th>Jobs</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(workers.data ?? []).map((w) => (
                <tr key={w.Id} data-testid="worker-row" className={w.Revoked ? 'is-revoked' : undefined}>
                  <td>
                    {w.Name || w.Id}
                    {w.Static && (
                      <span className="workers-badge" title="A token from the server environment">
                        static
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`workers-state is-${workerState(w).toLowerCase()}`}>{workerState(w)}</span>
                  </td>
                  <td className="cell-nowrap">{w.Connected ? 'Now' : formatDateTime(w.LastSeen)}</td>
                  <td>{(w.Pools ?? []).join(', ') || <span className="form-help">default</span>}</td>
                  <td>{inputModeLabel(w.InputMode)}</td>
                  <td>{capabilities(w)}</td>
                  <td className="cell-nowrap">{w.Capabilities ? `${w.ActiveJobs} / ${w.Capabilities.MaxJobs}` : w.ActiveJobs || ''}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit"
                      aria-label={`Edit ${w.Name || w.Id}`}
                      disabled={w.Static || !!w.Revoked}
                      onClick={() => setEditing(w)}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      type="button"
                      className="icon-button is-danger"
                      title="Revoke"
                      aria-label={`Revoke ${w.Name || w.Id}`}
                      disabled={w.Static || !!w.Revoked}
                      onClick={() => setRevoking(w)}
                    >
                      <Icon name="delete" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workers.isPending && <p className="table-status">Loading…</p>}
          {workers.isSuccess && workers.data.length === 0 && (
            <p className="table-status">No worker has enrolled. Create a join token below and start a worker with it.</p>
          )}
        </div>
      )}
      {editing && <EditWorker api={api} worker={editing} onClose={() => setEditing(null)} />}
      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.Name || revoking.Id}`}
          text="The worker disconnects and cannot connect again with its identity. Its running transcodes restart on another worker or on the server."
          confirmText="Revoke"
          danger
          busy={revoke.isPending}
          error={revoke.isError ? revoke.error.message : null}
          onConfirm={() => revoke.mutate(revoking.Id)}
          onCancel={() => {
            setRevoking(null);
            revoke.reset();
          }}
        />
      )}
    </Section>
  );
}

function EditWorker(props: { api: Api; worker: TranscodeWorker; onClose: () => void }) {
  const { api, worker } = props;
  const queryClient = useQueryClient();
  const [name, setName] = useState(worker.Name);
  const [mode, setMode] = useState(worker.InputMode || 'auto');
  const [pools, setPools] = useState((worker.Pools ?? []).join(', '));
  const save = useMutation({
    mutationFn: () => updateWorker(api, worker.Id, { Name: name.trim(), InputMode: mode as InputMode, Pools: parsePools(pools) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      props.onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Dialog title={`Edit ${worker.Name || worker.Id}`} onClose={props.onClose} testId="edit-worker">
      <form onSubmit={submit}>
        <TextField label="Name" value={name} onChange={setName} required />
        <SelectField
          label="Media input"
          value={mode}
          onChange={setMode}
          options={INPUT_MODES}
          help="Shared: the worker reads the media from its own mount of the libraries. Stream: the worker fetches the media from the server. Auto: shared when a path map of the worker covers the file."
        />
        <TextField
          label="Pools"
          value={pools}
          onChange={setPools}
          help="Comma-separated pool labels, for example nvenc or qsv. Placement rules and the default pools send jobs to a pool. Without pools the worker takes jobs for the default pools only when the default pools are empty."
        />
        <ErrorLine error={save.error} />
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={save.isPending || !name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function tokenState(t: JoinToken): string {
  if (t.Revoked) return 'Revoked';
  return t.Usable ? 'Usable' : 'Used up or expired';
}

function JoinTokens(props: { api: Api; serverUrl: string }) {
  const { api } = props;
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: [...KEY, 'join-tokens'], queryFn: () => fetchJoinTokens(api) });
  const [adding, setAdding] = useState(false);
  // The one-time token lives in this state only: it is gone after Dismiss or a reload.
  const [created, setCreated] = useState<CreatedJoinToken | null>(null);
  const [revoking, setRevoking] = useState<JoinToken | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => revokeJoinToken(api, id),
    onSuccess: () => setRevoking(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <Section title="Join tokens" testId="join-tokens">
      <p className="form-help">
        A worker enrolls with a join token and keeps its own identity in its state directory. A token with several uses
        enrolls a whole fleet. Revoking a token keeps the workers it enrolled.
      </p>
      {created && (
        <div className="workers-created" role="status" data-testid="created-token">
          <p>
            <strong>Copy the token now.</strong> The server keeps no copy, and this page shows it only once.
          </p>
          <Secret label="Token" value={created.Token} testId="created-token-value" />
          <p className="form-help">Save the token in the token file on the worker host, then start the worker:</p>
          <Secret label="Command" value={workerCommand(props.serverUrl)} testId="worker-command" />
          <div className="table-toolbar">
            <button type="button" className="button-outline" onClick={() => setCreated(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {tokens.isError ? (
        <ErrorLine error={tokens.error} />
      ) : (
        <>
          <div className="table-toolbar">
            <button type="button" className="button-outline" onClick={() => setAdding(true)}>
              <Icon name="add" />
              New Join Token
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table" data-testid="join-tokens-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>State</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Uses left</th>
                  <th>Fingerprint</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(tokens.data ?? []).map((t) => (
                  <tr key={t.Id} data-testid="join-token-row" className={t.Revoked ? 'is-revoked' : undefined}>
                    <td>{t.Name || t.Id}</td>
                    <td>{tokenState(t)}</td>
                    <td className="cell-nowrap">{formatDateTime(t.Created)}</td>
                    <td className="cell-nowrap">{t.Expires ? formatDateTime(t.Expires) : 'Never'}</td>
                    <td>{t.UsesLeft ?? 'Unlimited'}</td>
                    <td className="cell-mono workers-fingerprint">{t.Fingerprint}</td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="icon-button is-danger"
                        title="Revoke"
                        aria-label={`Revoke ${t.Name || t.Id}`}
                        disabled={!!t.Revoked}
                        onClick={() => setRevoking(t)}
                      >
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tokens.isPending && <p className="table-status">Loading…</p>}
            {tokens.isSuccess && tokens.data.length === 0 && <p className="table-status">No join tokens.</p>}
          </div>
        </>
      )}
      {adding && (
        <NewJoinToken
          api={api}
          onCreated={(t) => {
            setCreated(t);
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: KEY });
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.Name || revoking.Id}`}
          text="No new worker can enroll with this token. Workers it already enrolled stay; revoke them in the table above."
          confirmText="Revoke"
          danger
          busy={revoke.isPending}
          error={revoke.isError ? revoke.error.message : null}
          onConfirm={() => revoke.mutate(revoking.Id)}
          onCancel={() => {
            setRevoking(null);
            revoke.reset();
          }}
        />
      )}
    </Section>
  );
}

function NewJoinToken(props: { api: Api; onCreated: (t: CreatedJoinToken) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('86400');
  const [uses, setUses] = useState<number | null>(1);
  const [fingerprint, setFingerprint] = useState('');
  const create = useMutation({
    mutationFn: () =>
      createJoinToken(props.api, {
        Name: name.trim(),
        ...(Number(expiry) > 0 ? { ExpiresInSeconds: Number(expiry) } : {}),
        ...(uses ? { Uses: uses } : {}),
        ...(fingerprint.trim() ? { Fingerprint: fingerprint.trim() } : {}),
      }),
    onSuccess: props.onCreated,
  });
  const badFingerprint = fingerprint.trim() !== '' && !validFingerprint(fingerprint.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!badFingerprint) create.mutate();
  };
  return (
    <Dialog title="New Join Token" onClose={props.onClose} testId="new-join-token">
      <form onSubmit={submit}>
        <TextField label="Name" value={name} onChange={setName} required placeholder="gpu-nodes" />
        <SelectField label="Expires after" value={expiry} onChange={setExpiry} options={EXPIRY} />
        <NumberField
          label="Uses"
          value={uses}
          onChange={setUses}
          min={1}
          placeholder="Unlimited"
          help="How many workers can enroll with the token. Leave it empty for no limit, for example for an autoscaled pool."
        />
        <TextField
          label="Server key fingerprint (optional)"
          value={fingerprint}
          onChange={setFingerprint}
          help={
            <>
              Pins the server's TLS key: the worker refuses a server with another key. Print it with{' '}
              <code>deadfin worker fingerprint -cert &lt;certificate&gt;</code>.
            </>
          }
        />
        {badFingerprint && (
          <p className="form-error" role="alert">
            The fingerprint is a base64url SHA-256 of 43 characters.
          </p>
        )}
        <ErrorLine error={create.error} />
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={create.isPending || !name.trim() || badFingerprint}>
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** JSON text of a value for the advanced editors; '' for an empty value. */
function jsonText(v: unknown): string {
  if (v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && Object.keys(v).length === 0)) return '';
  return JSON.stringify(v, null, 2);
}

/** Parses an advanced editor; empty text is `empty`. Throws a readable error. */
export function parseJson<T>(label: string, text: string, empty: T): T {
  if (!text.trim()) return empty;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function Placement(props: { api: Api }) {
  const { api } = props;
  const queryClient = useQueryClient();
  const policy = useQuery({ queryKey: [...KEY, 'policy'], queryFn: () => fetchPolicy(api) });
  const [draft, setDraft] = useState<PlacementPolicy | null>(null);
  const [pools, setPools] = useState('');
  const [rules, setRules] = useState('');
  const [warm, setWarm] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const load = (p: PlacementPolicy) => {
    setDraft(p);
    setPools((p.DefaultPools ?? []).join(', '));
    setRules(jsonText(p.Rules));
    setWarm(jsonText(p.WarmSlots));
  };
  useEffect(() => {
    if (policy.data && draft === null) load(policy.data);
  }, [policy.data, draft]);
  const save = useMutation({
    mutationFn: () =>
      savePolicy(api, {
        ...draft!,
        DefaultPools: parsePools(pools),
        Rules: parseJson('Rules', rules, []),
        WarmSlots: parseJson('Warm slots', warm, {}),
      }),
    onSuccess: (saved) => {
      load(saved);
      setWarnings(saved.Warnings ?? []);
      queryClient.setQueryData([...KEY, 'policy'], saved);
    },
  });
  const set = (change: Partial<PlacementPolicy>) => {
    save.reset();
    setDraft((d) => (d ? { ...d, ...change } : d));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const rulesId = useId();
  const warmId = useId();

  return (
    <Section title="Placement" testId="placement">
      {policy.isError ? (
        <ErrorLine error={policy.error} />
      ) : !draft ? (
        <p className="readout">Loading…</p>
      ) : (
        <form className="settings-form" onSubmit={submit} data-testid="placement-form">
          <SelectField
            label="Placement mode"
            value={draft.Mode}
            onChange={(v) => set({ Mode: v as PlacementPolicy['Mode'] })}
            options={PLACEMENT_MODES}
            help={
              <>
                The environment variable <code>DEADFIN_TRANSCODE_WORKER_MODE</code> replaces this mode when the server
                starts.
              </>
            }
          />
          <SelectField
            label="Strategy"
            value={draft.Strategy}
            onChange={(v) => set({ Strategy: v as PlacementPolicy['Strategy'] })}
            options={[
              ['pack', 'Pack: fill the oldest worker first, so idle workers can scale away'],
              ['spread', 'Spread: take the least loaded worker'],
            ]}
          />
          <TextField
            label="Default pools"
            value={pools}
            onChange={setPools}
            help="Comma-separated pools for jobs that no rule matches. Empty: any worker."
          />
          {draft.Mode === 'local-first' && (
            <NumberField
              label="Local limit"
              value={draft.LocalLimit || null}
              onChange={(v) => set({ LocalLimit: v ?? 0 })}
              min={0}
              placeholder="Never spill"
              help="Transcodes the server runs before new ones go to workers. Empty: the server runs all of them."
            />
          )}
          {draft.Mode === 'workers-only' && (
            <NumberField
              label="Queue timeout (seconds)"
              value={draft.QueueTimeoutSeconds}
              onChange={(v) => set({ QueueTimeoutSeconds: v })}
              min={0}
              placeholder="10"
              help="How long a job waits for a worker. Empty: 10 seconds."
            />
          )}
          <CheckboxField
            label="Fall back to a software transcode on the server"
            help="At the end of the chain, when no worker and no server GPU can take a job."
            checked={draft.CpuFallback ?? true}
            onChange={(on) => set({ CpuFallback: on })}
          />
          <details className="workers-advanced">
            <summary>Rules and warm slots (advanced)</summary>
            <div className="form-field">
              <label htmlFor={rulesId}>Rules (JSON)</label>
              <textarea
                id={rulesId}
                className="workers-json"
                rows={8}
                spellCheck={false}
                value={rules}
                onChange={(e) => {
                  save.reset();
                  setRules(e.target.value);
                }}
                placeholder={'[{"Name": "4K HDR", "Match": {"Hdr": ["hdr10"]}, "Pools": ["nvenc"]}]'}
              />
              <p className="form-help">Ordered placement rules; the first match wins. Every set field of Match must match.</p>
            </div>
            <div className="form-field">
              <label htmlFor={warmId}>Warm slots (JSON)</label>
              <textarea
                id={warmId}
                className="workers-json"
                rows={3}
                spellCheck={false}
                value={warm}
                onChange={(e) => {
                  save.reset();
                  setWarm(e.target.value);
                }}
                placeholder={'{"*": 1, "nvenc": 2}'}
              />
              <p className="form-help">Free capacity per pool that the scaling signals ask for; "*" is the whole fleet. A pool without an entry gets 1.</p>
            </div>
          </details>
          {warnings.length > 0 && (
            <ul className="workers-warnings" data-testid="policy-warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <ErrorLine error={save.error} />
          <div className="table-toolbar">
            <button type="submit" className="button-primary" disabled={save.isPending}>
              Save
            </button>
            {save.isSuccess && <span className="form-help">Saved.</span>}
          </div>
        </form>
      )}
    </Section>
  );
}

/**
 * Plain HTTP for the worker routes (deadfin#664). Workers connect over TLS
 * unless the server allows plain HTTP. The dashboard value lives in the
 * `encoding` configuration; the environment variable wins when set. A
 * server without the setting gets the environment variable's name.
 */
function PlainHttp(props: { api: Api }) {
  const { api } = props;
  const queryClient = useQueryClient();
  const key = [...KEY, 'plain-http'];
  const state = useQuery({ queryKey: key, queryFn: () => fetchPlainHttp(api) });
  const save = useMutation({
    mutationFn: (on: boolean) => saveNamedConfiguration<Record<string, unknown>>(api, 'encoding', { [PLAIN_HTTP_FIELD]: on }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const v = state.data;
  return (
    <Section title="Connection" testId="plain-http">
      {state.isError ? (
        <ErrorLine error={state.error} />
      ) : v === undefined ? (
        <p className="readout">Loading…</p>
      ) : v === null ? (
        <p className="form-help">
          Workers connect over TLS. On a trusted network, set <code>DEADFIN_TRANSCODE_WORKERS_ALLOW_HTTP=true</code> on
          the server and start the worker with <code>-insecure</code> to allow plain HTTP. Media and segments then cross
          the network unencrypted.
        </p>
      ) : (
        <>
          <CheckboxField
            label="Allow workers to connect over plain HTTP"
            checked={v.AllowPlainHttp}
            disabled={v.SetByEnvironment || save.isPending}
            onChange={(on) => save.mutate(on)}
            help={
              v.SetByEnvironment ? (
                <>
                  Set by <code>DEADFIN_TRANSCODE_WORKERS_ALLOW_HTTP</code> on the server, which wins over this setting.
                </>
              ) : (
                'Only on a trusted network. The worker needs -insecure too. The change applies to new worker connections without a restart.'
              )
            }
          />
          {v.AllowPlainHttp && (
            <p className="form-help workers-warning" role="note">
              Transcode workers may connect over plain HTTP; media and segments cross the network unencrypted.
            </p>
          )}
          <ErrorLine error={save.error} />
        </>
      )}
    </Section>
  );
}

function ScalingToken(props: { api: Api }) {
  const { api } = props;
  const [token, setToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const create = useMutation({ mutationFn: () => createScalingToken(api), onSuccess: setToken });
  const remove = useMutation({
    mutationFn: () => deleteScalingToken(api),
    onSuccess: () => {
      setDeleting(false);
      setToken(null);
    },
  });
  return (
    <Section title="Scaling token" testId="scaling-token">
      <p className="form-help">
        An autoscaler (for example KEDA) reads <code>/deadfin/v1/workers/scaling</code> and{' '}
        <code>/deadfin/v1/metrics</code> with this token. A new token replaces the previous one.
      </p>
      {token && (
        <div className="workers-created" role="status">
          <p>
            <strong>Copy the token now.</strong> The server keeps only its hash.
          </p>
          <Secret label="Scaling token" value={token} testId="scaling-token-value" />
        </div>
      )}
      <ErrorLine error={create.error} />
      <div className="table-toolbar">
        <button type="button" className="button-outline" disabled={create.isPending} onClick={() => create.mutate()}>
          New Scaling Token
        </button>
        <button type="button" className="button-outline is-danger" onClick={() => setDeleting(true)}>
          Delete Scaling Token
        </button>
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete the scaling token"
          text="An autoscaler that uses the dashboard token stops getting signals. Tokens from DEADFIN_TRANSCODE_SCALING_TOKENS keep working."
          confirmText="Delete"
          danger
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onConfirm={() => remove.mutate()}
          onCancel={() => {
            setDeleting(false);
            remove.reset();
          }}
        />
      )}
    </Section>
  );
}

function Pins(props: { api: Api }) {
  const { api } = props;
  const queryClient = useQueryClient();
  const pins = useQuery({ queryKey: [...KEY, 'pins'], queryFn: () => fetchPins(api) });
  const [text, setText] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    if (pins.data && text === null) setText(pins.data.join('\n'));
  }, [pins.data, text]);
  const list = parseFingerprints(text ?? '');
  const bad = list.filter((f) => !validFingerprint(f));
  const save = useMutation({
    mutationFn: () => savePins(api, list),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, 'pins'] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (bad.length === 0) save.mutate();
  };
  return (
    <Section title="Server key pins" testId="pins">
      <details className="workers-advanced">
        <summary>Extra server key fingerprints (advanced)</summary>
        <p className="form-help">
          Before you replace the server's TLS key, add the new key's fingerprint here. Connected pinned workers accept it
          at once, so they keep connecting after the rotation. One fingerprint per line.
        </p>
        {pins.isError ? (
          <ErrorLine error={pins.error} />
        ) : text === null ? (
          <p className="readout">Loading…</p>
        ) : (
          <form onSubmit={submit} data-testid="pins-form">
            <div className="form-field">
              <label htmlFor={id}>Fingerprints</label>
              <textarea
                id={id}
                className="workers-json"
                rows={4}
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  save.reset();
                  setText(e.target.value);
                }}
              />
            </div>
            {bad.length > 0 && (
              <p className="form-error" role="alert">
                Not a base64url SHA-256: {bad.join(', ')}
              </p>
            )}
            <ErrorLine error={save.error} />
            <div className="table-toolbar">
              <button type="submit" className="button-primary" disabled={save.isPending || bad.length > 0}>
                Save
              </button>
              {save.isSuccess && <span className="form-help">Saved.</span>}
            </div>
          </form>
        )}
      </details>
    </Section>
  );
}
