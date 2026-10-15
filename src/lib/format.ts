/** Jellyfin ticks are 100ns units: 10,000,000 ticks per second. */
export const TICKS_PER_SECOND = 10_000_000;

/** "2h 14m" / "54m" / "" for missing or non-positive runtimes. */
export function formatRuntime(ticks?: number | null): string {
  if (!ticks || ticks <= 0) return '';
  const totalMinutes = Math.round(ticks / (TICKS_PER_SECOND * 60));
  if (totalMinutes < 1) return '<1m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Watch progress 0–100, clamped; 0 when either side is unusable. */
export function progressPercent(
  positionTicks?: number | null,
  runtimeTicks?: number | null,
): number {
  if (!positionTicks || !runtimeTicks || positionTicks <= 0 || runtimeTicks <= 0) return 0;
  return Math.min(100, Math.max(0, (positionTicks / runtimeTicks) * 100));
}

export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;
export const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

/** Player timecode: "0:07", "12:34", "1:02:03". */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** "1h 02m remaining" readout for the detail page. */
export function formatRemaining(
  positionTicks?: number | null,
  runtimeTicks?: number | null,
): string {
  if (!positionTicks || !runtimeTicks || positionTicks <= 0 || runtimeTicks <= positionTicks)
    return '';
  return `${formatRuntime(runtimeTicks - positionTicks)} remaining`;
}
