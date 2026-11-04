import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Api } from '../../api/client';
import type { BaseItem } from '../../api/library';
import {
  cancelSeriesTimer,
  cancelTimer,
  fetchRecordingFolders,
  fetchRecordings,
  fetchSeriesTimers,
  fetchTimers,
  groupTimersByDay,
  type SeriesTimer,
  type Timer,
} from '../../api/liveTv';
import { clock } from '../../api/programs';
import { ConfirmDialog } from '../../ui/Modal';
import { Shelf } from '../library/Shelf';
import { ProgramCard } from './Programs';
import './livetv.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
}

const NO_ITEMS = 'No Items are currently available.';

function Status(props: { error?: boolean; empty?: boolean }) {
  if (props.error)
    return (
      <p className="home-status readout" role="alert">
        This list could not be loaded.
      </p>
    );
  if (props.empty)
    return (
      <p className="home-status readout" data-testid="library-empty">
        {NO_ITEMS}
      </p>
    );
  return <p className="home-status readout">Loading…</p>;
}

/**
 * The Recordings tab, as jellyfin-web: Recently Added Recordings and All
 * Recordings (the recording groups). Deadfin has no DVR yet (deadfin#714),
 * so the server answers both with empty lists and the tab says so.
 */
export function RecordingsTab({ ctx }: { ctx: Ctx }) {
  const latest = useQuery({
    queryKey: ['recordings', ctx.userId, 'latest'],
    queryFn: () => fetchRecordings(ctx.api, ctx.userId, { isInProgress: false }),
  });
  const folders = useQuery({
    queryKey: ['recordings', ctx.userId, 'folders'],
    queryFn: () => fetchRecordingFolders(ctx.api, ctx.userId),
  });
  if (latest.isError && folders.isError) return <Status error />;
  if (latest.isPending || folders.isPending) return <Status />;
  if (!latest.data?.length && !folders.data?.length) return <Status empty />;
  return (
    <div className="programs" data-testid="recordings">
      <Shelf title="Recently Added Recordings" items={latest.data} serverUrl={ctx.serverUrl} />
      <Shelf title="All Recordings" items={folders.data} serverUrl={ctx.serverUrl} />
    </div>
  );
}

/**
 * The Schedule tab, as jellyfin-web: Active Recordings, then the scheduled
 * recordings by day. Each can be cancelled.
 */
export function ScheduleTab({ ctx }: { ctx: Ctx }) {
  const active = useQuery({
    queryKey: ['recordings', ctx.userId, 'active'],
    queryFn: () => fetchRecordings(ctx.api, ctx.userId, { isInProgress: true }),
  });
  const timers = useQuery({ queryKey: ['timers'], queryFn: () => fetchTimers(ctx.api) });
  if (active.isError && timers.isError) return <Status error />;
  if (active.isPending || timers.isPending) return <Status />;
  if (!active.data?.length && !timers.data?.length) return <Status empty />;
  return (
    <div className="programs" data-testid="schedule">
      <Shelf title="Active Recordings" items={active.data} serverUrl={ctx.serverUrl} />
      {groupTimersByDay(timers.data ?? []).map((g) => (
        <section key={g.name} className="shelf" aria-label={g.name || 'Scheduled'} data-testid="timer-group">
          <h2 className="shelf-head">
            <span className="shelf-name">{g.name}</span>
          </h2>
          <ul className="shelf-row program-row">
            {g.timers.map((t) => (
              <li key={t.Id} className="timer-card">
                <ProgramCard serverUrl={ctx.serverUrl} program={timerProgram(t)} />
                <CancelButton ctx={ctx} kind="timer" id={t.Id ?? ''} name={t.Name ?? ''} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The programme a timer records, for its card: the server's ProgramInfo, or the timer's own fields. */
export function timerProgram(t: Timer): BaseItem {
  return {
    ...t.ProgramInfo,
    Id: t.ProgramInfo?.Id ?? t.ProgramId ?? undefined,
    Name: t.ProgramInfo?.Name ?? t.Name,
    ChannelId: t.ProgramInfo?.ChannelId ?? t.ChannelId,
    ChannelName: t.ProgramInfo?.ChannelName ?? t.ChannelName,
    StartDate: t.StartDate ?? t.ProgramInfo?.StartDate,
    EndDate: t.EndDate ?? t.ProgramInfo?.EndDate,
  } as BaseItem;
}

/** The Series tab, as jellyfin-web: the series recordings by name, each with its time and channel. */
export function SeriesTab({ ctx }: { ctx: Ctx }) {
  const q = useQuery({ queryKey: ['series-timers'], queryFn: () => fetchSeriesTimers(ctx.api) });
  if (q.isError) return <Status error />;
  if (q.isPending) return <Status />;
  if (q.data.length === 0) return <Status empty />;
  return (
    <ul className="series-timers" data-testid="series-timers">
      {q.data.map((s) => (
        <li key={s.Id} className="series-timer" data-testid="series-timer">
          <span className="program-title">{s.Name}</span>
          <span className="program-meta readout">{seriesTimerTime(s)}</span>
          <span className="program-meta readout">{seriesTimerChannel(s)}</span>
          <CancelButton ctx={ctx} kind="series" id={s.Id ?? ''} name={s.Name ?? ''} />
        </li>
      ))}
    </ul>
  );
}

/** "Anytime" or the start time, as jellyfin-web's series timer card. */
export function seriesTimerTime(s: SeriesTimer): string {
  if (s.RecordAnyTime) return 'Anytime';
  const d = s.StartDate ? new Date(s.StartDate) : null;
  return d && !Number.isNaN(d.getTime()) ? clock(d) : '';
}

/** "All channels", the channel's name, or "One channel". */
export function seriesTimerChannel(s: SeriesTimer): string {
  if (s.RecordAnyChannel) return 'All channels';
  return s.ChannelName || 'One channel';
}

function CancelButton(props: { ctx: Ctx; kind: 'timer' | 'series'; id: string; name: string }) {
  const { ctx, kind, id } = props;
  const [ask, setAsk] = useState(false);
  const client = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => (kind === 'timer' ? cancelTimer(ctx.api, id) : cancelSeriesTimer(ctx.api, id)),
    onSuccess: () => {
      setAsk(false);
      void client.invalidateQueries({ queryKey: [kind === 'timer' ? 'timers' : 'series-timers'] });
      void client.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
  const label = kind === 'timer' ? 'Cancel recording' : 'Cancel series';
  return (
    <>
      <button type="button" className="library-order readout" aria-label={`${label}: ${props.name}`} onClick={() => setAsk(true)}>
        {label}
      </button>
      {ask && (
        <ConfirmDialog
          title={kind === 'timer' ? 'Cancel Recording' : 'Cancel Series'}
          text={kind === 'timer' ? 'Cancel recording?' : 'Cancel series?'}
          confirmText={label}
          danger
          busy={cancel.isPending}
          error={cancel.isError ? cancel.error.message : null}
          onConfirm={() => cancel.mutate()}
          onCancel={() => {
            setAsk(false);
            cancel.reset();
          }}
        />
      )}
    </>
  );
}
