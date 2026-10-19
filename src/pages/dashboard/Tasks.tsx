import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import {
  DAYS,
  fetchTask,
  hoursToTicks,
  INTERVALS,
  lastRan,
  saveTriggers,
  startTask,
  stopTask,
  tasksByCategory,
  TIMES_OF_DAY,
  triggerLimit,
  triggerName,
  type DayOfWeek,
  type TaskInfo,
  type TaskTrigger,
  type TriggerType,
} from '../../api/admin/tasks';
import { ConfirmDialog, Dialog } from '../../ui/Modal';
import { Field } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import { StreamedList } from '../../ui/StreamedList';
import { useLiveTasks } from './DashboardHome';
import './dashboard.css';

/** Progress bar with percent, or an open bar while the task has no percent yet. */
export function TaskProgress({ task }: { task: TaskInfo }) {
  const p = task.CurrentProgressPercentage;
  return (
    <div className="task-meter" data-testid="task-progress">
      <div
        className={p == null ? 'dash-progress is-open' : 'dash-progress'}
        role="progressbar"
        aria-label={`${task.Name ?? 'Task'} progress`}
        aria-valuenow={p == null ? undefined : Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: p == null ? '30%' : `${p}%` }} />
      </div>
      {p != null && <span className="task-percent">{Math.round(p)}%</span>}
    </div>
  );
}

function TaskStatus({ task }: { task: TaskInfo }) {
  if (task.State === 'Running') return <TaskProgress task={task} />;
  if (task.State === 'Cancelling') return <span className="form-help">Stopping</span>;
  const r = lastRan(task);
  if (!r) return null;
  return (
    <span className="form-help">
      {r.text}
      {r.fault && <span className="form-error"> ({r.fault})</span>}
    </span>
  );
}

function useRunStop(api: Api) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (t: TaskInfo) => (t.State === 'Running' ? stopTask(api, t.Id!) : startTask(api, t.Id!)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
  });
}

/** Scheduled tasks by category with live progress, as jellyfin-web `#/dashboard/tasks`. */
export function Tasks() {
  const { api } = useAuth();
  const tasks = useLiveTasks(api!);
  const runStop = useRunStop(api!);
  return (
    <>
      <PageHeader title="Scheduled Tasks" />
      {tasks.isError ? (
        <p className="form-error" role="alert">
          {tasks.error.message}
        </p>
      ) : !tasks.data ? (
        <p className="form-help">Loading…</p>
      ) : (
        tasksByCategory(tasks.data).map((g) => (
          <section key={g.category} className="task-group">
            <h2 className="form-section-title">{g.category}</h2>
            <StreamedList
              as="ul"
              className="dash-card task-list"
              items={g.tasks}
              render={(t) => (
                <li key={t.Id} className="task-row" data-testid="task-row">
                  <Link to={`/dashboard/tasks/${t.Id}`} className="task-link">
                    <span className="task-name">{t.Name}</span>
                    <TaskStatus task={t} />
                  </Link>
                  <button
                    type="button"
                    className="task-button"
                    aria-label={t.State === 'Running' ? `Stop ${t.Name}` : `Start ${t.Name}`}
                    title={t.State === 'Running' ? 'Stop' : 'Start'}
                    disabled={t.State === 'Cancelling' || (runStop.isPending && runStop.variables?.Id === t.Id)}
                    onClick={() => runStop.mutate(t)}
                  >
                    {t.State === 'Running' ? '■' : '▶'}
                  </button>
                </li>
              )}
            />
          </section>
        ))
      )}
      {runStop.isError && (
        <p className="form-error" role="alert">
          {runStop.error.message}
        </p>
      )}
    </>
  );
}

/** One task: description and triggers, with trigger add and remove (`#/dashboard/tasks/:id`). */
export function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const task = useQuery({
    queryKey: ['admin', 'task', id],
    queryFn: () => fetchTask(api!, id!),
    refetchInterval: (q) => (q.state.data?.State === 'Running' ? 1500 : false),
  });
  const runStop = useRunStop(api!);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: (triggers: TaskTrigger[]) => saveTriggers(api!, id!, triggers),
    onSuccess: () => {
      setAdding(false);
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'task', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] });
    },
  });
  if (task.isError)
    return (
      <p className="form-error" role="alert">
        {task.error.message}
      </p>
    );
  if (!task.data) return <p className="form-help">Loading…</p>;
  const t = task.data;
  const triggers = t.Triggers ?? [];
  return (
    <>
      <PageHeader
        title={t.Name}
        actions={
          <button type="button" className="button-plain" onClick={() => runStop.mutate(t)} disabled={t.State === 'Cancelling'}>
            {t.State === 'Running' ? 'Stop' : 'Start'}
          </button>
        }
      />
      <p>{t.Description}</p>
      <p>
        <TaskStatus task={t} />
      </p>
      <h2 className="form-section-title">Task Triggers</h2>
      <button type="button" className="button-plain" onClick={() => setAdding(true)}>
        + Add Trigger
      </button>
      <table className="dash-table" data-testid="task-triggers">
        <thead>
          <tr>
            <th>Time</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {triggers.map((tr, i) => (
            <tr key={i}>
              <td>
                <div>{triggerName(tr)}</div>
                {triggerLimit(tr) && <div className="form-help">{triggerLimit(tr)}</div>}
              </td>
              <td className="dash-table-actions">
                <button type="button" className="button-alarm" aria-label={`Remove ${triggerName(tr)}`} onClick={() => setRemoving(i)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {adding && (
        <NewTriggerDialog
          busy={save.isPending}
          error={save.isError ? save.error.message : null}
          onCancel={() => {
            setAdding(false);
            save.reset();
          }}
          onAdd={(tr) => save.mutate([...triggers, tr])}
        />
      )}
      {removing !== null && (
        <ConfirmDialog
          title="Delete Task Trigger"
          text="Are you sure you wish to delete this task trigger?"
          confirmText="Remove"
          danger
          busy={save.isPending}
          error={save.isError ? save.error.message : null}
          onConfirm={() => save.mutate(triggers.filter((_, i) => i !== removing))}
          onCancel={() => {
            setRemoving(null);
            save.reset();
          }}
        />
      )}
    </>
  );
}

/** The Add Trigger form: type, day, time, interval and time limit. */
export function NewTriggerDialog(props: {
  busy?: boolean;
  error?: string | null;
  onAdd: (t: TaskTrigger) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<TriggerType>('DailyTrigger');
  const [day, setDay] = useState<DayOfWeek>('Sunday');
  const [time, setTime] = useState(0);
  const [interval, setIntervalTicks] = useState(INTERVALS[3]!.ticks);
  const [limit, setLimit] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const tr: TaskTrigger = { Type: type };
    if (type === 'DailyTrigger' || type === 'WeeklyTrigger') tr.TimeOfDayTicks = time;
    if (type === 'WeeklyTrigger') tr.DayOfWeek = day;
    if (type === 'IntervalTrigger') tr.IntervalTicks = interval;
    const hours = parseFloat(limit);
    if (hours > 0) tr.MaxRuntimeTicks = hoursToTicks(hours);
    props.onAdd(tr);
  };
  return (
    <Dialog title="Add Trigger" onClose={props.onCancel} testId="new-trigger">
      <form onSubmit={submit}>
        <Field label="Trigger type">
          {(id) => (
            <select id={id} value={type} onChange={(e) => setType(e.target.value as TriggerType)}>
              <option value="DailyTrigger">Daily</option>
              <option value="WeeklyTrigger">Weekly</option>
              <option value="IntervalTrigger">On an interval</option>
              <option value="StartupTrigger">On application startup</option>
            </select>
          )}
        </Field>
        {type === 'WeeklyTrigger' && (
          <Field label="Day of week">
            {(id) => (
              <select id={id} value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {(type === 'DailyTrigger' || type === 'WeeklyTrigger') && (
          <Field label="Time">
            {(id) => (
              <select id={id} value={time} onChange={(e) => setTime(Number(e.target.value))}>
                {TIMES_OF_DAY.map((o) => (
                  <option key={o.ticks} value={o.ticks}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {type === 'IntervalTrigger' && (
          <Field label="Every">
            {(id) => (
              <select id={id} value={interval} onChange={(e) => setIntervalTicks(Number(e.target.value))}>
                {INTERVALS.map((o) => (
                  <option key={o.ticks} value={o.ticks}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Time limit (hours)">
          {(id) => <input id={id} type="number" min={1} step={0.5} value={limit} onChange={(e) => setLimit(e.target.value)} />}
        </Field>
        {props.error && (
          <p className="form-error" role="alert">
            {props.error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={props.busy}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
