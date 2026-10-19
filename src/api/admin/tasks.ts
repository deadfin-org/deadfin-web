import type { Api } from '../client';
import type { components } from '../schema';
import { check } from './check';
import { timeAgo } from './users';

export type TaskInfo = components['schemas']['TaskInfo'];
export type TaskTrigger = components['schemas']['TaskTriggerInfo'];
export type TriggerType = components['schemas']['TaskTriggerInfoType'];
export type DayOfWeek = components['schemas']['DayOfWeek'];

const TICKS_PER_MINUTE = 600_000_000;
const TICKS_PER_HOUR = 36_000_000_000;

export async function fetchTasks(api: Api): Promise<TaskInfo[]> {
  const { data, error, response } = await api.GET('/ScheduledTasks', { params: { query: { isHidden: false } } });
  check('Reading the scheduled tasks', error, response);
  return data ?? [];
}

export async function fetchTask(api: Api, taskId: string): Promise<TaskInfo> {
  const { data, error, response } = await api.GET('/ScheduledTasks/{taskId}', { params: { path: { taskId } } });
  check('Reading the task', error, response);
  return data!;
}

export async function startTask(api: Api, taskId: string): Promise<void> {
  const { error, response } = await api.POST('/ScheduledTasks/Running/{taskId}', { params: { path: { taskId } } });
  check('Starting the task', error, response);
}

export async function stopTask(api: Api, taskId: string): Promise<void> {
  const { error, response } = await api.DELETE('/ScheduledTasks/Running/{taskId}', { params: { path: { taskId } } });
  check('Stopping the task', error, response);
}

export async function saveTriggers(api: Api, taskId: string, triggers: TaskTrigger[]): Promise<void> {
  const { error, response } = await api.POST('/ScheduledTasks/{taskId}/Triggers', {
    params: { path: { taskId } },
    body: triggers,
  });
  check('Saving the triggers', error, response);
}

/** Categories in alphabetical order, each with its tasks by name. */
export function tasksByCategory(tasks: TaskInfo[]): { category: string; tasks: TaskInfo[] }[] {
  const groups = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const c = t.Category ?? '';
    groups.set(c, [...(groups.get(c) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({ category, tasks: list.sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? '')) }));
}

/** A tick count from midnight as a clock time, such as "3:00 AM". */
export function timeOfDay(ticks: number): string {
  const minutes = Math.round(ticks / TICKS_PER_MINUTE);
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Trigger words as jellyfin-web: "Daily at 3:00 AM", "Every 12 hours", "On application startup". */
export function triggerName(t: TaskTrigger): string {
  switch (t.Type) {
    case 'DailyTrigger':
      return `Daily at ${timeOfDay(t.TimeOfDayTicks ?? 0)}`;
    case 'WeeklyTrigger':
      return `${t.DayOfWeek ?? ''}s at ${timeOfDay(t.TimeOfDayTicks ?? 0)}`;
    case 'IntervalTrigger': {
      const hours = (t.IntervalTicks ?? 0) / TICKS_PER_HOUR;
      if (hours < 1) return `Every ${Math.round(hours * 60)} minutes`;
      if (hours === 1) return 'Every hour';
      return `Every ${hours} hours`;
    }
    case 'StartupTrigger':
      return 'On application startup';
    default:
      return t.Type ?? '';
  }
}

/** "Time limit: 2 hours", or null when the trigger has none. */
export function triggerLimit(t: TaskTrigger): string | null {
  if (!t.MaxRuntimeTicks) return null;
  const h = t.MaxRuntimeTicks / TICKS_PER_HOUR;
  return h === 1 ? 'Time limit: 1 hour' : `Time limit: ${h} hours`;
}

/** Interval choices for a new trigger, in ticks. */
export const INTERVALS: { ticks: number; label: string }[] = [0.25, 0.5, 0.75, 1, 2, 3, 4, 6, 8, 12, 24].map((h) => ({
  ticks: h * TICKS_PER_HOUR,
  label: h < 1 ? `${h * 60} minutes` : h === 1 ? '1 hour' : `${h} hours`,
}));

/** Time-of-day choices in 15-minute steps, in ticks. */
export const TIMES_OF_DAY: { ticks: number; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const ticks = i * 15 * TICKS_PER_MINUTE;
  return { ticks, label: timeOfDay(ticks) };
});

export const DAYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function hoursToTicks(hours: number): number {
  return Math.round(hours * TICKS_PER_HOUR);
}

/**
 * The status line of an idle task: "Last ran 2 hours ago, taking 3 minutes.",
 * plus the result when it did not complete. Null when it never ran.
 */
export function lastRan(task: TaskInfo, now = Date.now()): { text: string; fault: string | null } | null {
  const r = task.LastExecutionResult;
  if (!r?.StartTimeUtc || !r.EndTimeUtc) return null;
  const end = Date.parse(r.EndTimeUtc);
  const took = duration(end - Date.parse(r.StartTimeUtc));
  const fault =
    r.Status === 'Failed'
      ? 'Failed'
      : r.Status === 'Cancelled'
        ? 'Cancelled'
        : r.Status === 'Aborted'
          ? 'Aborted by server shutdown'
          : null;
  return { text: `Last ran ${timeAgo(now - end)}, taking ${took}.`, fault };
}

/** A duration in words: "less than a minute", "3 minutes", "2 hours". */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 30) return 'less than a minute';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}
