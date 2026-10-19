import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import {
  deleteListingProvider,
  deleteTunerHost,
  displayUrl,
  fetchLiveTvOptions,
  fetchRefreshGuideTask,
  providerTypeName,
  startTask,
  tunerTypeName,
  type ListingsProvider,
  type TaskInfo,
  type TunerHost,
} from '../../../api/liveTv';
import { FormSection } from '../../../ui/Form';
import { PageHeader } from '../../../ui/PageHeader';
import { SelectField, saveNamedConfiguration } from '../settings';
import { ChannelMapper } from './ChannelMapper';
import '../settings.css';
import './livetv.css';

const GUIDE_DAYS = [['', 'Auto'], ...Array.from({ length: 14 }, (_, i) => [String(i + 1), String(i + 1)] as const)] as const;

/**
 * Dashboard → Live TV (`#/dashboard/livetv`), as jellyfin-web
 * routes/livetv: tuner devices, guide data providers, Refresh Guide Data.
 */
export function LiveTv() {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const optionsKey = ['livetv-options', session?.serverUrl];
  const options = useQuery({ queryKey: optionsKey, enabled: !!api, queryFn: () => fetchLiveTvOptions(api!) });
  const [mapping, setMapping] = useState<ListingsProvider | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: optionsKey });
  if (!api || !session) return null;

  return (
    <>
      <PageHeader title="Live TV" />
      {options.isError ? (
        <p className="form-error" role="alert">
          {options.error.message}
        </p>
      ) : !options.data ? (
        <p className="readout">Loading…</p>
      ) : (
        <>
          <FormSection title="Tuner Devices">
            <div className="dash-row">
              <Link to="/dashboard/livetv/tuner" className="dash-button">
                + Add Tuner Device
              </Link>
            </div>
            {options.data.TunerHosts?.length ? (
              <ul className="tuner-cards" data-testid="tuner-cards">
                {options.data.TunerHosts.map((t) => (
                  <TunerCard key={t.Id} tuner={t} onDelete={() => deleteTunerHost(api, t.Id!).then(refresh)} />
                ))}
              </ul>
            ) : (
              <p className="form-help">No tuner devices.</p>
            )}
          </FormSection>

          <FormSection title="TV Guide Data Providers">
            <div className="dash-row">
              <AddProvider />
              <RefreshGuide />
            </div>
            {!!options.data.ListingProviders?.length && (
              <ul className="provider-list" data-testid="provider-list">
                {options.data.ListingProviders.map((p) => (
                  <ProviderItem
                    key={p.Id}
                    provider={p}
                    onMap={() => setMapping(p)}
                    onDelete={() => deleteListingProvider(api, p.Id!).then(refresh)}
                  />
                ))}
              </ul>
            )}
          </FormSection>

          <GuideDays stored={options.data.GuideDays} />
        </>
      )}
      {mapping?.Id && <ChannelMapper providerId={mapping.Id} onClose={() => setMapping(null)} />}
    </>
  );
}

/** Delete with an inline Yes/No, as jellyfin-web's confirm dialog asks. */
function DeleteButton(props: { question: string; onDelete: () => Promise<unknown> }) {
  const [asking, setAsking] = useState(false);
  const del = useMutation({ mutationFn: props.onDelete });
  if (!asking)
    return (
      <button type="button" className="dash-button" onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  return (
    <span className="dash-row" role="group" aria-label={props.question} style={{ margin: 0 }}>
      <span>{props.question}</span>
      <button type="button" className="dash-button is-danger" disabled={del.isPending} onClick={() => del.mutate()}>
        Delete
      </button>
      <button type="button" className="dash-button" onClick={() => setAsking(false)}>
        Cancel
      </button>
      {del.isError && (
        <span className="form-error" role="alert">
          {del.error.message}
        </span>
      )}
    </span>
  );
}

function TunerCard({ tuner, onDelete }: { tuner: TunerHost; onDelete: () => Promise<unknown> }) {
  const edit = `/dashboard/livetv/tuner?id=${encodeURIComponent(tuner.Id ?? '')}`;
  const groups = tuner.IncludeGroups?.length
    ? `${tuner.IncludeGroups.length} groups included`
    : tuner.ExcludeGroups?.length
      ? `${tuner.ExcludeGroups.length} groups excluded`
      : null;
  return (
    <li className="tuner-card" data-testid="tuner-card">
      <Link to={edit} className="tuner-card-title">
        {tuner.FriendlyName || tunerTypeName(tuner.Type)}
      </Link>
      <p className="tuner-card-text">{displayUrl(tuner.Url)}</p>
      <p className="tuner-card-text">
        {tunerTypeName(tuner.Type)}
        {groups && ` · ${groups}`}
      </p>
      <div className="tuner-card-actions">
        <Link to={edit} className="dash-button">
          Edit
        </Link>
        <DeleteButton question="Are you sure you wish to delete this device?" onDelete={onDelete} />
      </div>
    </li>
  );
}

function ProviderItem(props: { provider: ListingsProvider; onMap: () => void; onDelete: () => Promise<unknown> }) {
  const p = props.provider;
  const type = p.Type?.toLowerCase();
  const edit =
    type === 'xmltv' || type === 'schedulesdirect'
      ? `/dashboard/livetv/guide?type=${type}&id=${encodeURIComponent(p.Id ?? '')}`
      : null;
  return (
    <li className="provider-item" data-testid="provider-item">
      {edit ? (
        <Link to={edit} className="tuner-card-title">
          {providerTypeName(p.Type)}
        </Link>
      ) : (
        <span className="tuner-card-title">{providerTypeName(p.Type)}</span>
      )}
      <p className="tuner-card-text">{displayUrl(p.Path) || p.ListingsId}</p>
      <div className="tuner-card-actions">
        {edit && (
          <Link to={edit} className="dash-button">
            Edit
          </Link>
        )}
        <button type="button" className="dash-button" onClick={props.onMap}>
          Map Channels
        </button>
        <DeleteButton question="Are you sure you wish to delete this guide provider?" onDelete={props.onDelete} />
      </div>
    </li>
  );
}

function AddProvider() {
  const [open, setOpen] = useState(false);
  return (
    <span className="dash-row" style={{ margin: 0 }}>
      <button type="button" className="dash-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + Add Provider
      </button>
      {open && (
        <span role="menu" className="dash-row" style={{ margin: 0 }}>
          <Link role="menuitem" to="/dashboard/livetv/guide?type=schedulesdirect" className="dash-button">
            Schedules Direct
          </Link>
          <Link role="menuitem" to="/dashboard/livetv/guide?type=xmltv" className="dash-button">
            XMLTV
          </Link>
        </span>
      )}
    </span>
  );
}

/** Refresh Guide Data: starts the RefreshGuide task and shows its progress while it runs. */
function RefreshGuide() {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const key = ['refresh-guide-task', session?.serverUrl];
  const task = useQuery({
    queryKey: key,
    enabled: !!api,
    queryFn: () => fetchRefreshGuideTask(api!),
    refetchInterval: (q) => (isRunning(q.state.data) ? 2_000 : false),
  });
  const start = useMutation({
    mutationFn: () => startTask(api!, task.data!.Id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const running = isRunning(task.data) || start.isPending;
  if (task.isSuccess && !task.data) return null;
  return (
    <>
      <button type="button" className="dash-button" disabled={!task.data || running} onClick={() => start.mutate()}>
        ⟳ Refresh Guide Data
      </button>
      {running && <TaskProgress task={task.data} />}
      {start.isError && (
        <span className="form-error" role="alert">
          {start.error.message}
        </span>
      )}
    </>
  );
}

function isRunning(task: TaskInfo | undefined): boolean {
  return task?.State === 'Running' || task?.State === 'Cancelling';
}

function TaskProgress({ task }: { task: TaskInfo | undefined }) {
  const pct = task?.CurrentProgressPercentage;
  return (
    <span className="dash-row" style={{ margin: 0 }} data-testid="refresh-guide-progress">
      <progress className="task-progress" max={100} value={pct ?? undefined} aria-label="Refresh Guide progress" />
      {pct != null && <span>{Math.round(pct)}%</span>}
    </span>
  );
}

/** Number of days of guide data, from the `livetv` configuration. jellyfin-web shows it on the DVR page. */
function GuideDays({ stored }: { stored: number | null | undefined }) {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(stored ? String(stored) : '');
  useEffect(() => setValue(stored ? String(stored) : ''), [stored]);
  const save = useMutation({
    mutationFn: () => saveNamedConfiguration(api!, 'livetv', { GuideDays: value ? Number(value) : null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['livetv-options', session?.serverUrl] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <FormSection title="Guide Data">
      <form onSubmit={submit} data-testid="guide-days-form">
        <SelectField
          label="Number of days of guide data to download"
          value={value}
          onChange={(v) => {
            save.reset();
            setValue(v);
          }}
          options={GUIDE_DAYS}
          help="Downloading more days worth of guide data provides the ability to schedule out further in advance and view more listings, but it will also take longer to download. Auto will pick based on the number of channels."
        />
        <div className="save-bar">
          <button type="submit" className="button-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {save.isError && (
            <span className="form-error" role="alert">
              {save.error.message}
            </span>
          )}
          {save.isSuccess && <span role="status">Settings saved.</span>}
        </div>
      </form>
    </FormSection>
  );
}
