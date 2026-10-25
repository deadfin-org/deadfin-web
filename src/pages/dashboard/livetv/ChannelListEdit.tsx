import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import type { Api } from '../../../api/client';
import {
  addListChannels,
  fetchChannelGroups,
  fetchChannelLists,
  fetchListAccess,
  fetchListChannels,
  findChannels,
  normalizeId,
  removeListChannels,
  updateChannelList,
  type ChannelList,
  type ListAccess,
  type ListChannel,
} from '../../../api/admin/channelLists';
import { fetchUsers } from '../../../api/admin/users';
import { CheckboxField, Field, FormSection, SaveBar } from '../../../ui/Form';
import { ConfirmDialog, Dialog } from '../../../ui/Modal';
import { PageHeader } from '../../../ui/PageHeader';
import { STREAM_STEP, useSentinel } from '../../../ui/StreamedList';
import { LISTS_KEY, SharedWith } from './ChannelLists';
import '../dashboard.css';
import './livetv.css';

/** Channels the add picker shows for one group or search text. */
export const PICK_LIMIT = 200;

/** The channels that match a search text (name or number) and a group. */
export function filterChannels(channels: ListChannel[], text: string, group: string): ListChannel[] {
  const find = text.trim().toLowerCase();
  return channels.filter(
    (c) => (!group || c.Group === group) && (!find || c.Name.toLowerCase().includes(find) || c.Number === find),
  );
}

/** The groups of the channels in a list, with counts, by name. */
export function listGroups(channels: ListChannel[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of channels) counts.set(c.Group, (counts.get(c.Group) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Channel list editor (`#/dashboard/livetv/lists/:listId`): name, public flag, channels. */
export function ChannelListEdit() {
  const { listId } = useParams<{ listId: string }>();
  const { api, session } = useAuth();
  const owner = session?.userId ?? '';
  const lists = useQuery({ queryKey: [...LISTS_KEY, owner], enabled: !!api, queryFn: () => fetchChannelLists(api!, owner) });
  const access = useQuery({
    queryKey: [...LISTS_KEY, 'access', listId],
    enabled: !!api,
    queryFn: () => fetchListAccess(api!, listId!),
  });
  const list = lists.data?.find((l) => l.Id === listId);
  if (!api) return null;
  const error = lists.error ?? access.error;
  if (error)
    return (
      <p className="form-error" role="alert">
        {error.message}
      </p>
    );
  if (!lists.data || !access.data) return <p className="readout">Loading…</p>;
  if (!list)
    return (
      <p className="form-error" role="alert">
        There is no channel list with this id.
      </p>
    );
  return (
    <>
      <PageHeader title={list.Name} />
      <ListSettings key={list.Id + list.Name} api={api} list={list} access={access.data} />
      <ListChannels api={api} owner={owner} list={list} />
    </>
  );
}

function ListSettings(props: { api: Api; list: ChannelList; access: ListAccess }) {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => fetchUsers(props.api) });
  const [name, setName] = useState(props.list.Name);
  const [open, setOpen] = useState(props.access.Public);
  const save = useMutation({
    mutationFn: () => updateChannelList(props.api, props.list.Id, { Name: name.trim(), IsPublic: open }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: LISTS_KEY }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const names = new Map((users.data ?? []).map((u) => [normalizeId(u.Id ?? ''), u.Name ?? '']));
  return (
    <form onSubmit={submit} className="dash-form" data-testid="channel-list-form">
      <Field label="Name">
        {(id) => (
          <input
            id={id}
            value={name}
            required
            onChange={(e) => {
              setName(e.target.value);
              save.reset();
            }}
          />
        )}
      </Field>
      <CheckboxField
        label="Show this list to all users"
        help="A public list is open to all users, also to users that you add later. Keep a list private and share it on the user's Profile tab."
        checked={open}
        onChange={(on) => {
          setOpen(on);
          save.reset();
        }}
      />
      <p className="form-help">
        Shared with: <SharedWith listId={props.list.Id} names={names} />
      </p>
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
    </form>
  );
}

function ListChannels(props: { api: Api; owner: string; list: ChannelList }) {
  const queryClient = useQueryClient();
  const key = [...LISTS_KEY, 'channels', props.list.Id];
  const channels = useQuery({ queryKey: key, queryFn: () => fetchListChannels(props.api, props.owner, props.list.Id) });
  const [text, setText] = useState('');
  const [group, setGroup] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(STREAM_STEP * 3);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const all = useMemo(() => channels.data ?? [], [channels.data]);
  const rows = useMemo(() => filterChannels(all, text, group), [all, text, group]);
  const groups = useMemo(() => listGroups(all), [all]);
  const more = rows.length > shown;
  const sentinel = useSentinel(() => setShown((n) => n + STREAM_STEP * 3), more);
  const refresh = () => queryClient.invalidateQueries({ queryKey: LISTS_KEY });
  const remove = useMutation({
    mutationFn: () => removeListChannels(props.api, props.list.Id, all.filter((c) => checked.has(c.EntryId)).map((c) => c.EntryId)),
    onSuccess: () => {
      setChecked(new Set());
      setConfirm(false);
      void refresh();
    },
  });
  const toggle = (entryId: string, on: boolean) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (on) next.add(entryId);
      else next.delete(entryId);
      return next;
    });

  return (
    <FormSection title={`Channels (${all.length.toLocaleString()})`}>
      <div className="dash-row">
        <button type="button" className="dash-button" onClick={() => setAdding(true)}>
          + Add Channels
        </button>
        <button
          type="button"
          className="dash-button"
          disabled={rows.length === 0}
          onClick={() => setChecked(new Set(rows.map((c) => c.EntryId)))}
        >
          Check all shown ({rows.length.toLocaleString()})
        </button>
        <button type="button" className="dash-button" disabled={checked.size === 0} onClick={() => setChecked(new Set())}>
          Clear checks
        </button>
        <button type="button" className="dash-button is-danger" disabled={checked.size === 0} onClick={() => setConfirm(true)}>
          Remove checked ({checked.size.toLocaleString()})
        </button>
      </div>
      {channels.isError ? (
        <p className="form-error" role="alert">
          {channels.error.message}
        </p>
      ) : !channels.data ? (
        <p className="readout">Loading channels… A large list takes a few seconds.</p>
      ) : (
        <>
          <div className="channel-list-filters">
            <input
              type="search"
              aria-label="Find a channel in the list"
              placeholder={`Find among ${all.length.toLocaleString()} channels…`}
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value);
                setShown(STREAM_STEP * 3);
              }}
            />
            <select
              aria-label="Group"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setShown(STREAM_STEP * 3);
              }}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {`${g.name || '(no group)'} (${g.count})`}
                </option>
              ))}
            </select>
          </div>
          <p className="form-help" data-testid="list-channel-count">
            {rows.length.toLocaleString()} channels
          </p>
          <ul className="channel-map-list" data-testid="list-channels">
            {rows.slice(0, shown).map((c) => (
              <li key={c.EntryId} className="channel-map-row" data-testid="list-channel">
                <label className="form-check channel-map-name">
                  <input type="checkbox" checked={checked.has(c.EntryId)} onChange={(e) => toggle(c.EntryId, e.target.checked)} />
                  <span>
                    {c.Name}
                    <span className="form-help channel-list-group">{[c.Number, c.Group].filter(Boolean).join(' · ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div ref={sentinel} />
          {more && (
            <button type="button" className="button-plain list-more" onClick={() => setShown((n) => n + STREAM_STEP * 3)}>
              Load more
            </button>
          )}
        </>
      )}
      {adding && (
        <AddChannels
          api={props.api}
          owner={props.owner}
          list={props.list}
          inList={new Set(all.map((c) => c.Id))}
          onDone={() => {
            setAdding(false);
            void refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Remove Channels"
          text={`Remove ${checked.size.toLocaleString()} channels from ${props.list.Name}?`}
          confirmText="Remove"
          danger
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirm(false)}
        />
      )}
    </FormSection>
  );
}

/** Text typed in the search box reaches the server after this pause. */
const SEARCH_DELAY_MS = 300;

/** Pick Live TV channels by M3U group and name, and add them to the list. */
function AddChannels(props: {
  api: Api;
  owner: string;
  list: ChannelList;
  inList: Set<string>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [group, setGroup] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [text]);
  const groups = useQuery({
    queryKey: ['livetv-channel-groups', props.owner],
    queryFn: () => fetchChannelGroups(props.api, props.owner),
    staleTime: 5 * 60_000,
  });
  const found = useQuery({
    queryKey: ['livetv-find-channels', props.owner, group, search],
    enabled: !!group || !!search,
    queryFn: () => findChannels(props.api, props.owner, { group, text: search, limit: PICK_LIMIT }),
  });
  const add = useMutation({
    mutationFn: async (whole: boolean) => {
      let ids = [...picked];
      if (whole) {
        const all = await findChannels(props.api, props.owner, { group, text: search });
        ids = all.channels.map((c) => c.Id);
      }
      await addListChannels(props.api, props.owner, props.list.Id, ids.filter((id) => !props.inList.has(id)));
    },
    onSuccess: props.onDone,
  });
  const total = found.data?.total ?? 0;
  return (
    <Dialog
      title="Add Channels"
      wide
      onClose={props.onCancel}
      testId="add-channels"
      actions={
        <>
          <button type="button" className="button-plain" onClick={props.onCancel}>
            Cancel
          </button>
          {(!!group || !!search) && total > 0 && (
            <button type="button" className="button-plain" disabled={add.isPending} onClick={() => add.mutate(true)}>
              Add all {total.toLocaleString()} found
            </button>
          )}
          <button type="button" className="button-primary" disabled={add.isPending || picked.size === 0} onClick={() => add.mutate(false)}>
            Add checked ({picked.size.toLocaleString()})
          </button>
        </>
      }
    >
      <p className="form-help">Select a group from the M3U playlist, type a channel name, or do both.</p>
      <div className="channel-list-filters">
        <select aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {(groups.data ?? []).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Find a channel"
          placeholder="Channel name…"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {groups.isError && (
        <p className="form-error" role="alert">
          {groups.error.message}
        </p>
      )}
      {found.isError ? (
        <p className="form-error" role="alert">
          {found.error.message}
        </p>
      ) : !group && !search ? null : !found.data ? (
        <p className="readout">Loading…</p>
      ) : (
        <>
          <p className="form-help" data-testid="found-count">
            {total > found.data.channels.length
              ? `${total.toLocaleString()} channels found. The first ${found.data.channels.length} are shown.`
              : `${total.toLocaleString()} channels found.`}
          </p>
          <ul className="channel-map-list channel-list-picker">
            {found.data.channels.map((c) => {
              const there = props.inList.has(c.Id);
              return (
                <li key={c.Id} className="channel-map-row" data-testid="found-channel">
                  <label className="form-check channel-map-name">
                    <input
                      type="checkbox"
                      checked={there || picked.has(c.Id)}
                      disabled={there}
                      onChange={(e) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(c.Id);
                          else next.delete(c.Id);
                          return next;
                        })
                      }
                    />
                    <span>
                      {c.Name}
                      <span className="form-help channel-list-group">
                        {[c.Number, c.Group, there ? 'in the list' : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {add.isError && (
        <p className="form-error" role="alert">
          {add.error.message}
        </p>
      )}
    </Dialog>
  );
}
