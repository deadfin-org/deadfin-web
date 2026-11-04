import type { BaseItem } from './library';
import { episodeLabel } from './tv';

/** Guide time slots are half an hour wide, as jellyfin-web's guide. */
export const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60_000;
export const DAY_MS = 24 * 60 * 60_000;

type Timed = Pick<BaseItem, 'StartDate' | 'EndDate'>;

function ms(v?: string | null): number {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? NaN : t;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The 24 hours the guide shows for a day. Today starts at the current half
 * hour, so the guide opens at now; any other day starts at local midnight
 * (jellyfin-web `normalizeDateToTimeslot`).
 */
export function guideWindow(day: Date, now: Date = new Date()): { start: Date; end: Date } {
  let start: Date;
  if (startOfDay(day).getTime() === startOfDay(now).getTime()) {
    start = new Date(now);
    start.setMinutes(now.getMinutes() >= SLOT_MINUTES ? SLOT_MINUTES : 0, 0, 0);
  } else start = startOfDay(day);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** The half-hour slot starts across a window, for the time header. */
export function timeSlots(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) out.push(new Date(t));
  return out;
}

/**
 * The days the day picker offers: today through the guide's last day (at
 * most 14), or the next 7 days when the server gives no end date.
 */
export function guideDays(end: Date | null, now: Date = new Date()): { value: string; label: string }[] {
  const today = startOfDay(now);
  const last = end ? startOfDay(end) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (i > 0 && d.getTime() > last.getTime()) break;
    out.push({ value: dayValue(d), label: dayLabel(d, now) });
  }
  return out;
}

/** A day as `YYYY-MM-DD` in local time, for the `?day=` parameter. */
export function dayValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local day a `?day=` value names; null when it is not a date. */
export function parseDay(v: string | null): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayLabel(d: Date, now: Date = new Date()): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** "8:30 PM" in the user's locale. */
export function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Where a programme sits in a window, as fractions of the window: `left`
 * and `width` clip to the window; `clipped` says it began before it. Null
 * when it lies outside the window or has no times.
 */
export function placeProgram(p: Timed, start: Date, end: Date): { left: number; width: number; clipped: boolean } | null {
  const s = ms(p.StartDate);
  const e = ms(p.EndDate);
  const ws = start.getTime();
  const we = end.getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= ws || s >= we || e <= s) return null;
  const from = Math.max(s, ws);
  const to = Math.min(e, we);
  return { left: (from - ws) / (we - ws), width: (to - from) / (we - ws), clipped: s < ws };
}

/** Whether a programme is on now (jellyfin-web `playbackManager.canPlay` for a Program). */
export function isAiring(p: Timed, now: Date = new Date()): boolean {
  const s = ms(p.StartDate);
  const e = ms(p.EndDate);
  const t = now.getTime();
  return !Number.isNaN(s) && !Number.isNaN(e) && s <= t && t < e;
}

/** How far through a programme now is, 0–100. */
export function airedPercent(p: Timed, now: Date = new Date()): number {
  const s = ms(p.StartDate);
  const e = ms(p.EndDate);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.min(100, Math.max(0, ((now.getTime() - s) / (e - s)) * 100));
}

export type ProgramBadge = 'Live' | 'Premiere' | 'New' | 'Repeat';

/** Which guide indicators show; jellyfin-web's defaults leave Repeat off. */
export interface BadgeOptions {
  live: boolean;
  premiere: boolean;
  new: boolean;
  repeat: boolean;
}

const DEFAULT_BADGES: BadgeOptions = { live: true, premiere: true, new: true, repeat: false };

/**
 * The guide indicator, in jellyfin-web's order: Live, Premiere, New for a
 * series airing that is not a repeat, then Repeat. One that is turned off
 * gives way to the next.
 */
export function programBadge(
  p: Pick<BaseItem, 'IsLive' | 'IsPremiere' | 'IsSeries' | 'IsRepeat'>,
  show: BadgeOptions = DEFAULT_BADGES,
): ProgramBadge | null {
  if (p.IsLive && show.live) return 'Live';
  if (p.IsPremiere && show.premiere) return 'Premiere';
  if (p.IsSeries && !p.IsRepeat && show.new) return 'New';
  if (p.IsSeries && p.IsRepeat && show.repeat) return 'Repeat';
  return null;
}

/** "S7:E17 · The Doll", "The Doll", "S7:E17" or ''. */
export function episodeLine(p: Pick<BaseItem, 'ParentIndexNumber' | 'IndexNumber' | 'EpisodeTitle'>): string {
  const label = typeof p.IndexNumber === 'number' ? episodeLabel(p) : '';
  return [label, p.EpisodeTitle ?? ''].filter(Boolean).join(' · ');
}

/** "8:00 PM – 9:00 PM"; '' without times. */
export function timeRange(p: Timed): string {
  const s = ms(p.StartDate);
  const e = ms(p.EndDate);
  if (Number.isNaN(s) || Number.isNaN(e)) return '';
  return `${clock(new Date(s))} – ${clock(new Date(e))}`;
}

/** "Today 8:00 PM – 9:00 PM", for cards and the details page. */
export function airTime(p: Timed, now: Date = new Date()): string {
  const s = ms(p.StartDate);
  if (Number.isNaN(s)) return '';
  return `${dayLabel(new Date(s), now)} ${timeRange(p)}`;
}

/** The accessible name of a guide cell: title, episode, time, and state. */
export function programLabel(p: BaseItem, now: Date = new Date(), show: BadgeOptions = DEFAULT_BADGES): string {
  const parts = [p.Name ?? 'Untitled', episodeLine(p), timeRange(p), programBadge(p, show) ?? '', isAiring(p, now) ? 'On now' : ''];
  return parts.filter(Boolean).join(', ');
}
