import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import { describeServer } from '../../api/serverBuild';
import { useServerInfo } from '../../api/serverInfo';
import {
  fetchActiveSessions,
  fetchActivity,
  fetchItemCounts,
  fetchStorage,
  fetchSystemInfo,
  folderSpace,
  readableSize,
  restartServer,
  shutdownServer,
  type ActivityLogEntry,
  type FolderStorage,
  type ItemCounts,
  type SessionInfo,
} from '../../api/admin/system';
import { fetchTasks, startTask } from '../../api/admin/tasks';
import { timeAgo } from '../../api/admin/users';
import { describeWebBuild, webBuild } from '../../build';
import { ConfirmDialog } from '../../ui/Modal';
import { PageHeader } from '../../ui/PageHeader';
import { TaskProgress } from './Tasks';
import './dashboard.css';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Dashboard landing page, as jellyfin-web 12.0: Server (identity, Scan All
 * Libraries, Restart, Shutdown), item counts, running tasks, devices with
 * now playing, recent activity, alerts, and storage paths. Each widget loads
 * on its own, so a slow one never holds the others back.
 */
export function DashboardHome() {
  const { api } = useAuth();
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="dash-grid">
        <div className="dash-col">
          <ServerWidget api={api!} />
          <ItemCountsWidget api={api!} />
          <RunningTasksWidget api={api!} />
          <DevicesWidget api={api!} />
        </div>
        <div className="dash-col">
          <ActivityWidget api={api!} />
        </div>
        <div className="dash-col">
          <AlertsWidget api={api!} />
          <PathsWidget api={api!} />
        </div>
      </div>
    </>
  );
}

function Widget(props: { title: string; to: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="dash-widget" data-testid={props.testId}>
      <h2 className="dash-widget-title">
        <Link to={props.to}>{props.title} ›</Link>
      </h2>
      {props.children}
    </section>
  );
}

/** The scheduled tasks, polled fast while one runs. Shared by home, libraries and tasks. */
export function useLiveTasks(api: Api) {
  return useQuery({
    queryKey: ['admin', 'tasks'],
    queryFn: () => fetchTasks(api),
    refetchInterval: (q) => (q.state.data?.some((t) => t.State !== 'Idle') ? 1500 : 10_000),
  });
}

/** Starts the "Scan Media Library" task (key RefreshLibrary), as Scan All Libraries does. */
export function useScanAll(api: Api) {
  const queryClient = useQueryClient();
  const tasks = useLiveTasks(api);
  const task = tasks.data?.find((t) => t.Key === 'RefreshLibrary');
  const scan = useMutation({
    mutationFn: () => startTask(api, task!.Id!),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
  });
  return { task, scan, scanning: !!task && task.State !== 'Idle' };
}

function ServerWidget({ api }: { api: Api }) {
  const { session } = useAuth();
  const { identity } = useServerInfo(api, session!.serverUrl);
  const info = useQuery({ queryKey: ['admin', 'system-info'], queryFn: () => fetchSystemInfo(api) });
  const { task, scan, scanning } = useScanAll(api);
  const [ask, setAsk] = useState<'restart' | 'shutdown' | null>(null);
  const power = useMutation({
    mutationFn: (what: 'restart' | 'shutdown') => (what === 'restart' ? restartServer(api) : shutdownServer(api)),
    onSuccess: () => setAsk(null),
  });
  return (
    <Widget title="Server" to="/dashboard/settings">
      <dl className="kv-list dash-card" data-testid="dashboard-server">
        <dt>Server name</dt>
        <dd>{info.data?.ServerName ?? '…'}</dd>
        <dt>Server version</dt>
        <dd>{info.data?.Version ?? '…'}</dd>
        <dt>Web version</dt>
        <dd>{describeWebBuild(webBuild)}</dd>
        <dt>Build version</dt>
        <dd>{identity ? describeServer(identity) : '…'}</dd>
      </dl>
      <div className="dash-actions">
        <button
          type="button"
          className="button-plain"
          disabled={!task || scanning || scan.isPending}
          onClick={() => scan.mutate()}
        >
          {scanning ? 'Scanning…' : 'Scan All Libraries'}
        </button>
        <button type="button" className="button-alarm" onClick={() => setAsk('restart')}>
          Restart
        </button>
        <button type="button" className="button-alarm" onClick={() => setAsk('shutdown')}>
          Shutdown
        </button>
      </div>
      {info.data?.HasPendingRestart && <p className="form-help">The server needs a restart to apply changes.</p>}
      {scan.isError && (
        <p className="form-error" role="alert">
          {scan.error.message}
        </p>
      )}
      {power.isSuccess && (
        <p role="status" className="form-help">
          {power.variables === 'restart' ? 'The server is restarting.' : 'The server is shutting down.'}
        </p>
      )}
      {ask && (
        <ConfirmDialog
          title={ask === 'restart' ? 'Restart' : 'Shutdown'}
          text={
            ask === 'restart' ? 'Are you sure you wish to restart the server?' : 'Are you sure you wish to shut the server down?'
          }
          confirmText={ask === 'restart' ? 'Restart' : 'Shutdown'}
          danger
          busy={power.isPending}
          error={power.isError ? power.error.message : null}
          onConfirm={() => power.mutate(ask)}
          onCancel={() => {
            setAsk(null);
            power.reset();
          }}
        />
      )}
    </Widget>
  );
}

const COUNT_CARDS: { keys: (keyof ItemCounts)[]; labels: string[] }[] = [
  { keys: ['MovieCount'], labels: ['Movies'] },
  { keys: ['SeriesCount', 'EpisodeCount'], labels: ['Series', 'Episodes'] },
  { keys: ['AlbumCount', 'SongCount'], labels: ['Albums', 'Songs'] },
  { keys: ['MusicVideoCount'], labels: ['Music Videos'] },
  { keys: ['BookCount'], labels: ['Books'] },
  { keys: ['BoxSetCount'], labels: ['Collections'] },
];

function ItemCountsWidget({ api }: { api: Api }) {
  const counts = useQuery({ queryKey: ['admin', 'item-counts'], queryFn: () => fetchItemCounts(api), staleTime: 60_000 });
  const cards = COUNT_CARDS.filter((c) => counts.isPending || c.keys.some((k) => counts.data?.[k]));
  if (counts.isError || cards.length === 0) return null;
  return (
    <div className="dash-counts" data-testid="item-counts">
      {cards.map((c) => (
        <div key={c.labels.join()} className="dash-card dash-count">
          {c.keys.map((k, i) => (
            <div key={k}>
              <div className="dash-count-label">{c.labels[i]}</div>
              <div className="dash-count-value">{counts.data ? (counts.data[k] as number).toLocaleString() : '…'}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RunningTasksWidget({ api }: { api: Api }) {
  const tasks = useLiveTasks(api);
  const running = tasks.data?.filter((t) => t.State === 'Running') ?? [];
  if (running.length === 0) return null;
  return (
    <Widget title="Running Tasks" to="/dashboard/tasks">
      <div className="dash-card">
        {running.map((t) => (
          <div key={t.Id} className="dash-running">
            <div>{t.Name}</div>
            <TaskProgress task={t} />
          </div>
        ))}
      </div>
    </Widget>
  );
}

function DevicesWidget({ api }: { api: Api }) {
  const { session } = useAuth();
  const sessions = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => fetchActiveSessions(api),
    refetchInterval: 10_000,
  });
  return (
    <Widget title="Devices" to="/dashboard/devices" testId="dashboard-devices">
      {sessions.isError ? (
        <p className="form-error">{sessions.error.message}</p>
      ) : !sessions.data ? (
        <p className="form-help">Loading…</p>
      ) : (
        <div className="dash-sessions">
          {sessions.data.map((s) => (
            <SessionCard key={s.Id} s={s} serverUrl={session!.serverUrl} />
          ))}
        </div>
      )}
    </Widget>
  );
}

function SessionCard({ s, serverUrl }: { s: SessionInfo; serverUrl: string }) {
  const item = s.NowPlayingItem;
  const pos = s.PlayState?.PositionTicks ?? 0;
  const len = item?.RunTimeTicks ?? 0;
  const imgTag = item?.ImageTags?.['Primary'];
  const img = item?.Id && imgTag ? `${serverUrl}/Items/${item.Id}/Images/Primary?fillHeight=120&quality=80&tag=${imgTag}` : '';
  const title = item
    ? [item.SeriesName, item.Name].filter(Boolean).join(' – ')
    : s.LastActivityDate
      ? `Last activity ${timeAgo(Date.now() - Date.parse(s.LastActivityDate))}`
      : '';
  return (
    <div className="dash-card dash-session" data-testid="session-card">
      {img && <img className="dash-session-img" src={img} alt="" loading="lazy" />}
      <div className="dash-session-body">
        <div className="dash-session-device">{s.DeviceName}</div>
        <div className="form-help">
          {[s.Client, s.ApplicationVersion].filter(Boolean).join(' ')}
          {s.UserName ? ` · ${s.UserName}` : ''}
        </div>
        <div className="dash-session-now">{title}</div>
        {item && len > 0 && (
          <div className="dash-progress" aria-label="Playback position">
            <div style={{ width: `${Math.min(100, (pos / len) * 100)}%` }} />
          </div>
        )}
        {item && s.PlayState?.PlayMethod && (
          <div className="form-help">
            {s.PlayState.IsPaused ? 'Paused · ' : ''}
            {s.PlayState.PlayMethod === 'Transcode' ? 'Transcoding' : s.PlayState.PlayMethod === 'DirectStream' ? 'Direct Streaming' : 'Direct Playing'}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityList({ entries }: { entries: ActivityLogEntry[] }) {
  return (
    <ul className="dash-card dash-activity">
      {entries.map((e) => (
        <li key={e.Id}>
          <div>{e.Name}</div>
          <div className="form-help">
            {e.Date ? timeAgo(Date.now() - Date.parse(e.Date)) : ''}
            {e.ShortOverview ? ` · ${e.ShortOverview}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityWidget({ api }: { api: Api }) {
  const log = useQuery({
    queryKey: ['admin', 'activity', 'user'],
    queryFn: () => fetchActivity(api, { hasUserId: true, limit: 7, sinceMs: DAY }),
    refetchInterval: 30_000,
  });
  return (
    <Widget title="Activity" to="/dashboard/activity?useractivity=true" testId="dashboard-activity">
      {log.isError ? (
        <p className="form-error">{log.error.message}</p>
      ) : !log.data ? (
        <p className="form-help">Loading…</p>
      ) : log.data.length === 0 ? (
        <p className="form-help">No activity in the last day.</p>
      ) : (
        <ActivityList entries={log.data} />
      )}
    </Widget>
  );
}

function AlertsWidget({ api }: { api: Api }) {
  const log = useQuery({
    queryKey: ['admin', 'activity', 'alerts'],
    queryFn: () => fetchActivity(api, { hasUserId: false, limit: 4, sinceMs: 7 * DAY }),
    refetchInterval: 60_000,
  });
  if (!log.data?.length) return null;
  return (
    <Widget title="Alerts" to="/dashboard/activity?useractivity=false">
      <ActivityList entries={log.data} />
    </Widget>
  );
}

const PATHS: { key: string; label: string }[] = [
  { key: 'CacheFolder', label: 'Cache' },
  { key: 'ImageCacheFolder', label: 'Image Cache' },
  { key: 'ProgramDataFolder', label: 'Program Data' },
  { key: 'LogFolder', label: 'Logs' },
  { key: 'InternalMetadataFolder', label: 'Metadata' },
  { key: 'TranscodingTempFolder', label: 'Transcodes' },
  { key: 'WebFolder', label: 'Web' },
];

function PathsWidget({ api }: { api: Api }) {
  const storage = useQuery({ queryKey: ['admin', 'storage'], queryFn: () => fetchStorage(api), staleTime: 60_000 });
  return (
    <Widget title="Paths" to="/dashboard/settings" testId="dashboard-paths">
      {storage.isError ? (
        <p className="form-error">{storage.error.message}</p>
      ) : (
        <ul className="dash-card dash-paths">
          {PATHS.map((p) => (
            <StorageRow
              key={p.key}
              label={p.label}
              folder={storage.data?.[p.key as keyof typeof storage.data] as FolderStorage | undefined}
              loading={!storage.data}
            />
          ))}
        </ul>
      )}
    </Widget>
  );
}

function StorageRow({ label, folder, loading }: { label: string; folder?: FolderStorage; loading: boolean }) {
  const { used, total, percent } = folderSpace(folder);
  const level = percent >= 90 ? 'is-full' : percent >= 80 ? 'is-high' : '';
  return (
    <li>
      <div className="form-help">{label}</div>
      <div className="dash-path">{loading ? '…' : (folder?.Path ?? '')}</div>
      <div className={`dash-progress ${level}`} role="meter" aria-label={`${label} used`} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="form-help dash-space">
        {used === null ? '?' : readableSize(used)} / {total === null ? '?' : readableSize(total)}
      </div>
    </li>
  );
}
