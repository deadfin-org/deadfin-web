import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import {
  createChannelList,
  deleteChannelList,
  fetchChannelLists,
  fetchListAccess,
  LIST_PREFIX,
  normalizeId,
  type ChannelList,
} from '../../../api/admin/channelLists';
import { fetchUsers } from '../../../api/admin/users';
import { ConfirmDialog, InputDialog } from '../../../ui/Modal';
import { PageHeader } from '../../../ui/PageHeader';
import '../dashboard.css';
import './livetv.css';

/** Query keys of the channel list pages; a change invalidates the whole prefix. */
export const LISTS_KEY = ['admin', 'channel-lists'] as const;

/**
 * Dashboard → Live TV → Channel Lists (`#/dashboard/livetv/lists`): the
 * playlists of Live TV channels that limit what a user sees (Deadfin D-94,
 * D-105). A list opens in its editor; the user editor shares it.
 */
export function ChannelLists() {
  const { api, session } = useAuth();
  const owner = session?.userId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: [...LISTS_KEY, owner], enabled: !!api, queryFn: () => fetchChannelLists(api!, owner) });
  const users = useQuery({ queryKey: ['admin', 'users'], enabled: !!api, queryFn: () => fetchUsers(api!) });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ChannelList | null>(null);
  const create = useMutation({
    mutationFn: (name: string) => createChannelList(api!, owner, name),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: LISTS_KEY });
      navigate(`/dashboard/livetv/lists/${id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChannelList(api!, id),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const names = new Map((users.data ?? []).map((u) => [normalizeId(u.Id ?? ''), u.Name ?? '']));

  return (
    <>
      <PageHeader title="Channel Lists" />
      <p className="form-help">
        A channel list is a playlist of Live TV channels. To limit the channels of a user, open the user's Profile tab and
        check the lists that the user can see.
      </p>
      <div className="dash-row">
        <button type="button" className="dash-button" onClick={() => setAdding(true)}>
          + New List
        </button>
      </div>
      {lists.isError ? (
        <p className="form-error" role="alert">
          {lists.error.message}
        </p>
      ) : !lists.data ? (
        <p className="readout">Loading…</p>
      ) : lists.data.length === 0 ? (
        <p className="form-help">There are no channel lists.</p>
      ) : (
        <table className="dash-table" data-testid="channel-lists">
          <thead>
            <tr>
              <th>Name</th>
              <th>Channels</th>
              <th>Shared with</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lists.data.map((l) => (
              <tr key={l.Id} data-testid="channel-list-row">
                <td>
                  <Link to={`/dashboard/livetv/lists/${l.Id}`} className="tuner-card-title">
                    {l.Name}
                  </Link>
                </td>
                <td>{l.Count.toLocaleString()}</td>
                <td>
                  <SharedWith listId={l.Id} names={names} />
                </td>
                <td className="dash-table-actions">
                  <button type="button" className="dash-button is-danger" onClick={() => setDeleting(l)} aria-label={`Delete ${l.Name}`}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <InputDialog
          title="New Channel List"
          label="Name"
          initial={LIST_PREFIX}
          confirmText="Create"
          help="Only you see a new list until you share it with a user."
          busy={create.isPending}
          error={create.isError ? create.error.message : null}
          onConfirm={(name) => create.mutate(name)}
          onCancel={() => setAdding(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.Name}`}
          text="Users who see a channel only through this list will not see that channel after you delete the list. The channels stay on the server."
          confirmText="Delete"
          danger
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onConfirm={() => remove.mutate(deleting.Id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** "Public", the user names, or "Only you". */
export function SharedWith(props: { listId: string; names: Map<string, string> }) {
  const { api } = useAuth();
  const access = useQuery({
    queryKey: [...LISTS_KEY, 'access', props.listId],
    enabled: !!api,
    queryFn: () => fetchListAccess(api!, props.listId),
  });
  if (access.isError) return <span className="form-help">Unknown</span>;
  if (!access.data) return <span className="form-help">…</span>;
  if (access.data.Public) return <>All users (public)</>;
  if (access.data.Users.length === 0) return <>Only you</>;
  return <>{access.data.Users.map((id) => props.names.get(id) ?? id).join(', ')}</>;
}
