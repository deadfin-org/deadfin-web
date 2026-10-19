import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import { createUser, fetchChannels, fetchMediaFolders, updatePolicy } from '../../api/admin/users';
import { Field } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import { AccessList } from './UserAccess';
import './dashboard.css';

const NAME_HELP =
  "Usernames can contain letters, numbers, spaces, and the following characters: - _ ' . @ +. They cannot begin or end with a space.";

/** New user: name, password, library and channel access (`#/dashboard/users/add`). */
export function UserAdd() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: ['admin', 'media-folders'], queryFn: () => fetchMediaFolders(api!) });
  const channels = useQuery({ queryKey: ['admin', 'channels'], queryFn: () => fetchChannels(api!) });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [allFolders, setAllFolders] = useState(true);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [allChannels, setAllChannels] = useState(true);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: async () => {
      const user = await createUser(api!, name.trim(), password);
      const policy = user.Policy!;
      await updatePolicy(api!, user.Id!, {
        ...policy,
        EnableAllFolders: allFolders,
        EnabledFolders: allFolders ? [] : folderIds,
        EnableAllChannels: allChannels,
        EnabledChannels: allChannels ? [] : channelIds,
      });
      return user;
    },
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate(`/dashboard/users/${user.Id}/profile`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <form onSubmit={submit} className="dash-form" data-testid="new-user-form">
      <PageHeader title="Add User" />
      <Field label="Name" help={NAME_HELP}>
        {(id) => <input id={id} name="username" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />}
      </Field>
      <Field label="Password">
        {(id) => (
          <input id={id} name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        )}
      </Field>
      <AccessList
        title="Library Access"
        allLabel="Enable access to all libraries"
        listTitle="Libraries"
        help="Select the libraries to share with this user. Administrators will be able to edit all folders using the metadata manager."
        all={allFolders}
        onAll={setAllFolders}
        items={folders.data ?? []}
        selected={folderIds}
        onSelected={setFolderIds}
      />
      {!!channels.data?.length && (
        <AccessList
          title="Channel Access"
          allLabel="Enable access to all channels"
          listTitle="Channels"
          help="Select the channels to share with this user. Administrators will be able to edit all channels using the metadata manager."
          all={allChannels}
          onAll={setAllChannels}
          items={channels.data}
          selected={channelIds}
          onSelected={setChannelIds}
        />
      )}
      {create.isError && (
        <p className="form-error" role="alert">
          {create.error.message}
        </p>
      )}
      <div className="save-bar">
        <button type="submit" className="button-primary" disabled={create.isPending || !name.trim()}>
          {create.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="button-plain" onClick={() => navigate('/dashboard/users')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
