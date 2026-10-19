import { useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import {
  activityViewFromParam,
  activityViewParam,
  fetchActivityPage,
  fetchUserNames,
  type ActivityEntry,
  type ActivityView,
} from '../../api/admin/activity';
import { formatDateTime } from '../../lib/dateTime';
import { detailsUrl } from '../../routes/paths';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { useStreamOnScroll } from '../../ui/useStreamOnScroll';
import '../../ui/table.css';

/** Entries per request. */
export const ACTIVITY_PAGE = 50;

const VIEWS: { view: ActivityView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'user', label: 'User' },
  { view: 'system', label: 'System' },
];

/** Dashboard → Activity: the activity log, newest first, streamed as it scrolls. */
export function Activity() {
  const { session, api } = useAuth();
  if (!session || !api) return null;
  return <ActivityTable api={api} serverUrl={session.serverUrl} />;
}

export function ActivityTable(props: { api: Api; serverUrl: string }) {
  const { api, serverUrl } = props;
  const [params, setParams] = useSearchParams();
  const view = activityViewFromParam(params.get('useractivity'));
  const setView = (v: ActivityView) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        const value = activityViewParam(v);
        if (value === null) next.delete('useractivity');
        else next.set('useractivity', value);
        return next;
      },
      { replace: true },
    );

  const users = useQuery({
    queryKey: ['dashboard-user-names', serverUrl],
    queryFn: () => fetchUserNames(api),
    staleTime: 5 * 60_000,
  });
  const entries = useInfiniteQuery({
    queryKey: ['dashboard-activity', serverUrl, view],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchActivityPage(api, { view, startIndex: pageParam, limit: ACTIVITY_PAGE }),
    getNextPageParam: (last) => {
      const next = last.startIndex + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
    staleTime: 0,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = entries;
  const more = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const sentinel = useStreamOnScroll(!!hasNextPage, isFetchingNextPage, more);
  const rows = entries.data?.pages.flatMap((p) => p.items) ?? [];
  const showUser = view !== 'system';

  return (
    <div data-testid="activity-page">
      <PageHeader title="Activity" />
      <div className="table-toolbar">
        <div className="toggle-group" role="group" aria-label="Activity">
          {VIEWS.map((v) => (
            <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => setView(v.view)}>
              {v.label}
            </button>
          ))}
        </div>
        {entries.data && (
          <span className="readout" data-testid="activity-count">
            {entries.data.pages[0]?.total ?? 0} entries
          </span>
        )}
      </div>
      {entries.isError ? (
        <p className="form-error" role="alert">
          Failed to load activities
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="activity-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                {showUser && <th>User</th>}
                <th>Name</th>
                <th>Overview</th>
                <th>Type</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <ActivityRow key={e.Id} entry={e} showUser={showUser} userName={e.UserId ? users.data?.get(e.UserId) : undefined} />
              ))}
            </tbody>
          </table>
          {entries.isPending && <p className="table-status">Loading…</p>}
          {entries.isSuccess && rows.length === 0 && <p className="table-status">No activity.</p>}
          {isFetchingNextPage && <p className="table-status">Loading…</p>}
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}

const LEVEL_CLASS: Record<string, string> = {
  Information: 'is-info',
  Warning: 'is-warning',
  Error: 'is-error',
  Critical: 'is-error',
};

function ActivityRow(props: { entry: ActivityEntry; showUser: boolean; userName?: string }) {
  const { entry: e } = props;
  const overview = e.ShortOverview || e.Overview || '';
  return (
    <tr data-testid="activity-row">
      <td className="cell-nowrap">{formatDateTime(e.Date)}</td>
      <td>{e.Severity && <span className={`level-chip ${LEVEL_CLASS[e.Severity] ?? ''}`}>{e.Severity}</span>}</td>
      {props.showUser && <td>{props.userName ?? ''}</td>}
      <td>{e.Name}</td>
      <td title={e.Overview && e.Overview !== overview ? e.Overview : undefined}>{overview}</td>
      <td>{e.Type}</td>
      <td className="cell-actions">
        {e.ItemId && (
          <Link to={detailsUrl(e.ItemId)} className="icon-button" title="Media details" aria-label="Media details">
            <Icon name="media" />
          </Link>
        )}
      </td>
    </tr>
  );
}
