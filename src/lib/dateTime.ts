/** Local date and time for dashboard tables, as jellyfin-web's DateTimeCell; '' when missing or invalid. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}
