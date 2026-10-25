import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import {
  fetchChannelLists,
  fetchListAccess,
  normalizeId,
  shortListName,
  type ChannelList,
  type ListAccess,
} from '../../api/admin/channelLists';
import { CheckboxField } from '../../ui/Form';

export interface ListShares {
  lists: ChannelList[];
  access: Record<string, ListAccess>;
  /** Lists shared with the user now. */
  current: Set<string>;
  /** Lists open to all users. */
  open: Set<string>;
}

/** The channel lists and which of them the user can see now. */
export function useListShares(userId: string, enabled: boolean) {
  const { api, session } = useAuth();
  const owner = session?.userId ?? '';
  return useQuery({
    queryKey: ['admin', 'channel-list-shares', owner, userId],
    enabled: !!api && enabled,
    queryFn: async (): Promise<ListShares> => {
      const lists = await fetchChannelLists(api!, owner);
      const access = Object.fromEntries(await Promise.all(lists.map(async (l) => [l.Id, await fetchListAccess(api!, l.Id)] as const)));
      const me = normalizeId(userId);
      return {
        lists,
        access,
        current: new Set(lists.filter((l) => access[l.Id]!.Users.includes(me)).map((l) => l.Id)),
        open: new Set(lists.filter((l) => access[l.Id]!.Public).map((l) => l.Id)),
      };
    },
  });
}

/**
 * One checkbox per channel list. A checked list is shared with the user; a
 * public list is open to all users, so its box stays checked.
 */
export function ChannelListChecks(props: {
  shares: ReturnType<typeof useListShares>;
  wanted: Set<string>;
  onChange: (wanted: Set<string>) => void;
}) {
  const { shares, wanted } = props;
  if (shares.isError)
    return (
      <p className="form-error" role="alert">
        {shares.error.message}
      </p>
    );
  if (!shares.data) return <p className="form-help">Loading the channel lists…</p>;
  const { lists, open } = shares.data;
  return (
    <fieldset className="check-list" data-testid="channel-list-checks">
      <legend>Channel lists</legend>
      <div className="check-list-scroll">
        {lists.length === 0 && <p className="form-help">There are no channel lists.</p>}
        {lists.map((l) => {
          const isOpen = open.has(l.Id);
          return (
            <CheckboxField
              key={l.Id}
              label={`${shortListName(l.Name)} (${l.Count.toLocaleString()} channels${isOpen ? ', public' : ''})`}
              checked={isOpen || wanted.has(l.Id)}
              disabled={isOpen}
              onChange={(on) => {
                const next = new Set(wanted);
                if (on) next.add(l.Id);
                else next.delete(l.Id);
                props.onChange(next);
              }}
            />
          );
        })}
      </div>
      <p className="form-help">
        The user sees only the channels in the checked lists. If no list is checked, the user sees no channels. A public
        list is open to all users. <Link to="/dashboard/livetv/lists">Edit the channel lists</Link>
      </p>
    </fieldset>
  );
}
