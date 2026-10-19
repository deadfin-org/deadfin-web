import type { Api } from '../client';
import type { components } from '../schema';

export type ActivityEntry = components['schemas']['ActivityLogEntry'];

/** All, User or System, as jellyfin-web's toggle; `?useractivity=true|false` in the URL. */
export type ActivityView = 'all' | 'user' | 'system';

export function activityViewFromParam(param: string | null): ActivityView {
  if (param === null) return 'all';
  return param.toLowerCase() === 'true' ? 'user' : 'system';
}

export function activityViewParam(view: ActivityView): string | null {
  return view === 'all' ? null : String(view === 'user');
}

export interface ActivityPage {
  items: ActivityEntry[];
  total: number;
  startIndex: number;
}

/** GET /System/ActivityLog/Entries, newest first. */
export async function fetchActivityPage(
  api: Api,
  opts: { view: ActivityView; startIndex: number; limit: number },
): Promise<ActivityPage> {
  const { data, error } = await api.GET('/System/ActivityLog/Entries', {
    params: {
      query: {
        startIndex: opts.startIndex,
        limit: opts.limit,
        ...(opts.view === 'all' ? {} : { hasUserId: opts.view === 'user' }),
        sortBy: ['DateCreated'],
        sortOrder: ['Descending'],
      },
    },
  });
  if (error !== undefined || !data) throw new Error('Failed to load activities');
  const items = data.Items ?? [];
  return { items, total: data.TotalRecordCount ?? items.length, startIndex: opts.startIndex };
}

/** User names by id, for the User column (`/Users`, administrators only). */
export async function fetchUserNames(api: Api): Promise<Map<string, string>> {
  const { data, error } = await api.GET('/Users');
  if (error !== undefined || !data) throw new Error('Failed to load users');
  return new Map(data.filter((u) => u.Id).map((u) => [u.Id!, u.Name ?? '']));
}
