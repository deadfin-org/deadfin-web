import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import {
  fetchChannels,
  fetchMediaFolders,
  fetchProviders,
  fetchUser,
  updatePassword,
  updatePolicy,
  updateUser,
  USER_TABS,
  type UserDto,
  type UserPolicy,
} from '../../api/admin/users';
import { ConfirmDialog } from '../../ui/Modal';
import { CheckboxField, Field, FormSection, SaveBar } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import { Tabs } from '../../ui/Tabs';
import { UserAccessTab } from './UserAccess';
import { UserParentalTab } from './UserParental';
import './dashboard.css';

/** User edit page with the Profile, Access, Parental Control and Password tabs (`#/dashboard/users/:userId/:tab`). */
export function UserEdit() {
  const { userId, tab } = useParams<{ userId: string; tab: string }>();
  const { api } = useAuth();
  const navigate = useNavigate();
  const user = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => fetchUser(api!, userId!) });
  const index = USER_TABS.findIndex((t) => t.key === tab);
  if (index < 0) return <Navigate to={`/dashboard/users/${userId}/profile`} replace />;
  if (user.isError)
    return (
      <p className="form-error" role="alert">
        Failed to load users edit page. {user.error.message}
      </p>
    );
  if (!user.data) return <p className="form-help">Loading…</p>;
  const u = user.data;
  return (
    <>
      <PageHeader title={u.Name} />
      <Tabs
        label="User settings"
        labels={USER_TABS.map((t) => t.label)}
        selected={index}
        onSelect={(i) => navigate(`/dashboard/users/${userId}/${USER_TABS[i]!.key}`, { replace: true })}
      />
      {/* Remount per user and tab so each form starts from the saved values. */}
      <div role="tabpanel" key={`${u.Id}-${tab}`}>
        {tab === 'profile' && <UserProfileTab user={u} />}
        {tab === 'access' && <UserAccessTab user={u} />}
        {tab === 'parentalcontrol' && <UserParentalTab user={u} />}
        {tab === 'password' && <UserPasswordTab user={u} />}
      </div>
    </>
  );
}

const NAME_HELP =
  "Usernames can contain letters, numbers, spaces, and the following characters: - _ ' . @ +. They cannot begin or end with a space.";

type BoolKey = { [K in keyof UserPolicy]-?: UserPolicy[K] extends boolean | undefined ? K : never }[keyof UserPolicy];

/** Profile tab: every UserPolicy field jellyfin-web 12.0 shows on it. */
function UserProfileTab({ user }: { user: UserDto }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authProviders = useQuery({ queryKey: ['admin', 'auth-providers'], queryFn: () => fetchProviders(api!, 'auth') });
  const resetProviders = useQuery({ queryKey: ['admin', 'reset-providers'], queryFn: () => fetchProviders(api!, 'reset') });
  const folders = useQuery({ queryKey: ['admin', 'media-folders'], queryFn: () => fetchMediaFolders(api!) });
  const deletableChannels = useQuery({ queryKey: ['admin', 'channels', 'deletion'], queryFn: () => fetchChannels(api!, true) });
  const [name, setName] = useState(user.Name ?? '');
  const [policy, setPolicy] = useState<UserPolicy>({
    ...user.Policy!,
    EnableRemoteAccess: user.Policy?.EnableRemoteAccess ?? true,
  });
  const [bitrate, setBitrate] = useState(
    policy.RemoteClientBitrateLimit ? String(policy.RemoteClientBitrateLimit / 1e6) : '',
  );
  const save = useMutation({
    mutationFn: async () => {
      const next: UserPolicy = {
        ...policy,
        RemoteClientBitrateLimit: Math.floor(1e6 * (parseFloat(bitrate) || 0)),
        EnableContentDeletionFromFolders: policy.EnableContentDeletion ? [] : (policy.EnableContentDeletionFromFolders ?? []),
      };
      await updateUser(api!, { ...user, Name: name.trim() });
      await updatePolicy(api!, user.Id!, next);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['users-me'] });
      navigate('/dashboard/users', { state: { saved: true } });
    },
  });
  const check = (key: BoolKey, label: string, help?: string) => (
    <CheckboxField
      label={label}
      help={help}
      checked={!!policy[key]}
      onChange={(on) => {
        setPolicy((p) => ({ ...p, [key]: on }));
        save.reset();
      }}
    />
  );
  const setNum = (key: 'LoginAttemptsBeforeLockout' | 'MaxActiveSessions', v: string) =>
    setPolicy((p) => ({ ...p, [key]: parseInt(v || '0', 10) || 0 }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const deletable = [...(folders.data ?? []), ...(deletableChannels.data ?? [])];
  return (
    <form onSubmit={submit} className="dash-form" data-testid="user-profile-form">
      {policy.IsDisabled && (
        <div className="dash-banner" role="note">
          <strong>This user is currently disabled</strong>
          <div>See below to reenable</div>
        </div>
      )}
      <Field label="Name" help={NAME_HELP}>
        {(id) => <input id={id} name="username" value={name} onChange={(e) => setName(e.target.value)} required />}
      </Field>
      {(authProviders.data?.length ?? 0) > 1 && (
        <Field label="Authentication Provider" help="Select an authentication provider to be used to authenticate this user's password.">
          {(id) => (
            <select
              id={id}
              value={policy.AuthenticationProviderId}
              onChange={(e) => setPolicy((p) => ({ ...p, AuthenticationProviderId: e.target.value }))}
            >
              {authProviders.data!.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {(resetProviders.data?.length ?? 0) > 1 && (
        <Field label="Password Reset Provider" help="Pick a password reset provider to be used when this user requests a password reset.">
          {(id) => (
            <select
              id={id}
              value={policy.PasswordResetProviderId}
              onChange={(e) => setPolicy((p) => ({ ...p, PasswordResetProviderId: e.target.value }))}
            >
              {resetProviders.data!.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {check('EnableRemoteAccess', 'Allow remote connections to this server', 'If unchecked, all remote connections will be blocked.')}
      {check('IsAdministrator', 'Allow this user to manage the server')}
      {check('EnableCollectionManagement', 'Allow this user to manage collections')}
      {check('EnableSubtitleManagement', 'Allow this user to edit subtitles')}
      <FormSection title="Feature access">
        {check('EnableLiveTvAccess', 'Allow Live TV access')}
        {check('EnableLiveTvManagement', 'Allow Live TV recording management')}
      </FormSection>
      <FormSection title="Media playback">
        {check('EnableMediaPlayback', 'Allow media playback')}
        {check('EnableAudioPlaybackTranscoding', 'Allow audio playback that requires transcoding')}
        {check('EnableVideoPlaybackTranscoding', 'Allow video playback that requires transcoding')}
        {check('EnablePlaybackRemuxing', 'Allow video playback that requires conversion without re-encoding')}
        {check('ForceRemoteSourceTranscoding', 'Force transcoding of remote media sources such as Live TV')}
        <p className="form-help">
          Restricting access to transcoding may cause playback failures in clients due to unsupported media formats.
        </p>
        <Field
          label="Internet streaming bitrate limit (Mbps)"
          help="An optional per-stream bitrate limit for all out of network devices. Override the default global value set in server settings, see Dashboard > Playback > Streaming."
        >
          {(id) => (
            <input id={id} type="number" min={0} step={0.25} value={bitrate} onChange={(e) => setBitrate(e.target.value)} />
          )}
        </Field>
        <Field
          label="SyncPlay access"
          help="The SyncPlay feature enables to sync playback with other devices. Select the level of access this user has to the SyncPlay."
        >
          {(id) => (
            <select
              id={id}
              value={policy.SyncPlayAccess ?? 'CreateAndJoinGroups'}
              onChange={(e) => setPolicy((p) => ({ ...p, SyncPlayAccess: e.target.value as UserPolicy['SyncPlayAccess'] }))}
            >
              <option value="CreateAndJoinGroups">Allow user to create and join groups</option>
              <option value="JoinGroups">Allow user to join groups</option>
              <option value="None">Disabled for this user</option>
            </select>
          )}
        </Field>
      </FormSection>
      <FormSection title="Allow media deletion from">
        {check('EnableContentDeletion', 'All libraries')}
        {!policy.EnableContentDeletion && (
          <fieldset className="check-list">
            <legend className="sr-only">Libraries</legend>
            {deletable.map((f) => (
              <CheckboxField
                key={f.Id}
                label={f.Name}
                checked={(policy.EnableContentDeletionFromFolders ?? []).includes(f.Id)}
                onChange={(on) =>
                  setPolicy((p) => {
                    const cur = p.EnableContentDeletionFromFolders ?? [];
                    return { ...p, EnableContentDeletionFromFolders: on ? [...cur, f.Id] : cur.filter((x) => x !== f.Id) };
                  })
                }
              />
            ))}
          </fieldset>
        )}
      </FormSection>
      <FormSection title="Remote Control">
        {check('EnableRemoteControlOfOtherUsers', 'Allow remote control of other users')}
        {check(
          'EnableSharedDeviceControl',
          'Allow remote control of shared devices',
          'DLNA devices are considered shared until a user begins controlling them.',
        )}
      </FormSection>
      <FormSection title="Other">
        {check(
          'EnableContentDownloading',
          'Allow media downloads',
          'Users can download media and store it on their devices. This is not the same as a sync feature. Book libraries require this enabled to function properly.',
        )}
        {check(
          'IsDisabled',
          'Disable this user',
          'The server will not allow any connections from this user. Existing connections will be abruptly ended.',
        )}
        {check(
          'IsHidden',
          'Hide this user from login screens',
          'Useful for private or hidden administrator accounts. The user will need to sign in manually by entering their username and password.',
        )}
        <Field
          label="Failed login tries before user is locked out"
          help="A value of zero means inheriting the default of three tries for normal users and five for administrators. Setting this to -1 will disable the feature."
        >
          {(id) => (
            <input
              id={id}
              type="number"
              min={-1}
              step={1}
              value={policy.LoginAttemptsBeforeLockout ?? -1}
              onChange={(e) => setNum('LoginAttemptsBeforeLockout', e.target.value)}
            />
          )}
        </Field>
        <Field label="Maximum number of simultaneous user sessions" help="A value of 0 will disable the feature.">
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              step={1}
              value={policy.MaxActiveSessions ?? 0}
              onChange={(e) => setNum('MaxActiveSessions', e.target.value)}
            />
          )}
        </Field>
      </FormSection>
      <div className="save-bar">
        <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} />
        <button type="button" className="button-plain" onClick={() => navigate('/dashboard/users')}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Password tab: change or reset the password. */
function UserPasswordTab({ user }: { user: UserDto }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);
  const done = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.Id] });
  };
  const save = useMutation({
    mutationFn: () => updatePassword(api!, user.Id!, { CurrentPw: user.HasConfiguredPassword ? current : '', NewPw: next }),
    onSuccess: done,
  });
  const reset = useMutation({
    mutationFn: () => updatePassword(api!, user.Id!, { ResetPassword: true }),
    onSuccess: () => {
      setAskReset(false);
      done();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.reset();
    if (next !== confirm) setProblem('Password and password confirmation must match.');
    else if (!next && user.Policy?.IsAdministrator) setProblem('New password cannot be empty.');
    else {
      setProblem(null);
      save.mutate();
    }
  };
  return (
    <form onSubmit={submit} className="dash-form" data-testid="user-password-form">
      {user.HasConfiguredPassword && (
        <Field label="Current password">
          {(id) => <input id={id} type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
      )}
      <Field label="New password">
        {(id) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="New password confirm">
        {(id) => <input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      {(problem || save.isError) && (
        <p className="form-error" role="alert">
          {problem ?? 'Invalid username or password. Please try again.'}
        </p>
      )}
      {save.isSuccess && <p role="status">Password saved.</p>}
      {reset.isSuccess && <p role="status">The password has been reset.</p>}
      <div className="save-bar">
        <button type="submit" className="button-primary" disabled={save.isPending}>
          Save Password
        </button>
        {user.HasConfiguredPassword && !user.Policy?.IsAdministrator && (
          <button type="button" className="button-plain" onClick={() => setAskReset(true)}>
            Reset Password
          </button>
        )}
      </div>
      {askReset && (
        <ConfirmDialog
          title="Reset Password"
          text="Are you sure you wish to reset the password?"
          confirmText="Reset Password"
          busy={reset.isPending}
          error={reset.isError ? reset.error.message : null}
          onConfirm={() => reset.mutate()}
          onCancel={() => setAskReset(false)}
        />
      )}
    </form>
  );
}

