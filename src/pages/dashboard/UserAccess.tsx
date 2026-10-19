import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import {
  fetchChannels,
  fetchDevices,
  fetchMediaFolders,
  updatePolicy,
  type NameIdPair,
  type UserDto,
} from '../../api/admin/users';
import { CheckboxField, FormSection, SaveBar } from '../../ui/Form';

/** "Enable access to all …" plus a checkbox per item when it is off, as jellyfin-web's AccessContainer. */
export function AccessList(props: {
  title: string;
  allLabel: string;
  listTitle: string;
  help: string;
  all: boolean;
  onAll: (v: boolean) => void;
  items: NameIdPair[];
  selected: string[];
  onSelected: (ids: string[]) => void;
}) {
  const toggle = (id: string, on: boolean) =>
    props.onSelected(on ? [...props.selected, id] : props.selected.filter((s) => s !== id));
  return (
    <FormSection title={props.title}>
      <CheckboxField label={props.allLabel} checked={props.all} onChange={props.onAll} />
      {!props.all && (
        <fieldset className="check-list">
          <legend>{props.listTitle}</legend>
          {props.items.map((i) => (
            <CheckboxField
              key={i.Id}
              label={i.Name}
              checked={props.selected.includes(i.Id)}
              onChange={(on) => toggle(i.Id, on)}
            />
          ))}
        </fieldset>
      )}
      <p className="form-help">{props.help}</p>
    </FormSection>
  );
}

/** Access tab: libraries, channels and devices the user may use. */
export function UserAccessTab({ user }: { user: UserDto }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: ['admin', 'media-folders'], queryFn: () => fetchMediaFolders(api!) });
  const channels = useQuery({ queryKey: ['admin', 'channels'], queryFn: () => fetchChannels(api!) });
  const devices = useQuery({ queryKey: ['admin', 'devices-list'], queryFn: () => fetchDevices(api!) });
  const p = user.Policy!;
  const [allFolders, setAllFolders] = useState(!!p.EnableAllFolders);
  const [folderIds, setFolderIds] = useState<string[]>(p.EnabledFolders ?? []);
  const [allChannels, setAllChannels] = useState(!!p.EnableAllChannels);
  const [channelIds, setChannelIds] = useState<string[]>(p.EnabledChannels ?? []);
  const [allDevices, setAllDevices] = useState(!!p.EnableAllDevices);
  const [deviceIds, setDeviceIds] = useState<string[]>(p.EnabledDevices ?? []);
  const save = useMutation({
    mutationFn: () =>
      updatePolicy(api!, user.Id!, {
        ...p,
        EnableAllFolders: allFolders,
        EnabledFolders: allFolders ? [] : folderIds,
        EnableAllChannels: allChannels,
        EnabledChannels: allChannels ? [] : channelIds,
        EnableAllDevices: allDevices,
        EnabledDevices: allDevices ? [] : deviceIds,
        BlockedChannels: null,
        BlockedMediaFolders: null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.Id] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    save.reset();
  };
  return (
    <form onSubmit={submit} className="dash-form" data-testid="user-access-form">
      <AccessList
          title="Library Access"
          allLabel="Enable access to all libraries"
          listTitle="Libraries"
          help="Select the libraries to share with this user. Administrators will be able to edit all folders using the metadata manager."
          all={allFolders}
          onAll={touch(setAllFolders)}
          items={folders.data ?? []}
          selected={folderIds}
          onSelected={touch(setFolderIds)}
        />
      {!!channels.data?.length && (
        <AccessList
          title="Channel Access"
          allLabel="Enable access to all channels"
          listTitle="Channels"
          help="Select the channels to share with this user. Administrators will be able to edit all channels using the metadata manager."
          all={allChannels}
          onAll={touch(setAllChannels)}
          items={channels.data}
          selected={channelIds}
          onSelected={touch(setChannelIds)}
        />
      )}
      {devices.data && !p.IsAdministrator && (
        <AccessList
          title="Device Access"
          allLabel="Enable access from all devices"
          listTitle="Devices"
          help="This only applies to devices that can be uniquely identified and will not prevent browser access. Filtering user device access will prevent them from using new devices until they've been approved here."
          all={allDevices}
          onAll={touch(setAllDevices)}
          items={devices.data}
          selected={deviceIds}
          onSelected={touch(setDeviceIds)}
        />
      )}
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
    </form>
  );
}
