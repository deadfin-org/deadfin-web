import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import {
  deletableIds,
  deleteDevices,
  deviceApp,
  deviceName,
  fetchDevices,
  renameDevice,
  type Device,
} from '../../api/admin/devices';
import { deviceId } from '../../api/session';
import { formatDateTime } from '../../lib/dateTime';
import { ConfirmDialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { useStreamOnScroll } from '../../ui/useStreamOnScroll';
import '../../ui/table.css';

/** Rows added to the table each time its end scrolls near. */
export const DEVICE_ROWS = 50;

/** Dashboard → Devices: the device table with rename, delete and Delete All, as jellyfin-web. */
export function Devices() {
  const { session, api } = useAuth();
  if (!session || !api) return null;
  return <DevicesTable api={api} serverUrl={session.serverUrl} currentDeviceId={deviceId()} />;
}

export function DevicesTable(props: { api: Api; serverUrl: string; currentDeviceId: string }) {
  const { api, serverUrl, currentDeviceId } = props;
  const queryClient = useQueryClient();
  const key = ['dashboard-devices', serverUrl];
  const devices = useQuery({ queryKey: key, queryFn: () => fetchDevices(api) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Device | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => renameDevice(api, v.id, v.name),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteDevices(api, ids),
    onSuccess: () => {
      setPendingDelete(null);
      setDeleteAllOpen(false);
    },
    onSettled: refresh,
  });

  // The device list comes whole from the server; the table adds rows as it scrolls.
  const all = devices.data ?? [];
  const [shown, setShown] = useState(DEVICE_ROWS);
  const rows = useMemo(() => all.slice(0, shown), [all, shown]);
  const more = useCallback(() => setShown((n) => n + DEVICE_ROWS), []);
  const sentinel = useStreamOnScroll(shown < all.length, false, more);

  const save = (d: Device, name: string) => {
    setEditing(null);
    const current = d.CustomName || d.Name || '';
    if (d.Id && name.trim() !== current) rename.mutate({ id: d.Id, name });
  };

  return (
    <div data-testid="devices-page">
      <PageHeader title="Devices" />
      {devices.isError ? (
        <p className="form-error" role="alert">
          Failed to load devices
        </p>
      ) : (
        <>
          <div className="table-toolbar">
            <button
              type="button"
              className="button-outline is-danger"
              data-testid="devices-delete-all"
              disabled={deletableIds(all, currentDeviceId).length === 0}
              onClick={() => setDeleteAllOpen(true)}
            >
              <Icon name="delete" />
              Delete All
            </button>
            {rename.isError && (
              <span className="form-error" role="alert">
                {rename.error.message}
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table className="data-table" data-testid="devices-table">
              <thead>
                <tr>
                  <th>Last active</th>
                  <th>Device</th>
                  <th>App name</th>
                  <th>User</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <DeviceRow
                    key={d.Id}
                    device={d}
                    isCurrent={d.Id === currentDeviceId}
                    editing={editing === d.Id}
                    onEdit={() => setEditing(d.Id ?? null)}
                    onCancel={() => setEditing(null)}
                    onSave={(name) => save(d, name)}
                    onDelete={() => setPendingDelete(d)}
                  />
                ))}
              </tbody>
            </table>
            {devices.isPending && <p className="table-status">Loading…</p>}
            {devices.isSuccess && all.length === 0 && <p className="table-status">No devices.</p>}
          </div>
          <div ref={sentinel} />
        </>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Device"
        text="Are you sure you wish to delete this device? It will reappear the next time a user signs in with it."
        confirmText="Delete"
        busy={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onConfirm={() => pendingDelete?.Id && remove.mutate([pendingDelete.Id])}
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
      />
      <ConfirmDialog
        open={deleteAllOpen}
        title="Delete All Devices"
        text="Are you sure you wish to delete all devices? All other sessions will be logged out. Devices will reappear the next time a user signs in."
        confirmText="Delete"
        busy={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onConfirm={() => remove.mutate(deletableIds(all, currentDeviceId))}
        onCancel={() => {
          setDeleteAllOpen(false);
          remove.reset();
        }}
      />
    </div>
  );
}

function DeviceRow(props: {
  device: Device;
  isCurrent: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
  onDelete: () => void;
}) {
  const { device: d } = props;
  const name = deviceName(d);
  const [draft, setDraft] = useState(name);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') props.onSave(draft);
    else if (e.key === 'Escape') props.onCancel();
  };
  return (
    <tr data-testid="device-row">
      <td className="cell-nowrap">{formatDateTime(d.DateLastActivity)}</td>
      <td>
        {props.editing ? (
          <input
            aria-label="Device"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
        ) : (
          <span data-testid="device-name">{name}</span>
        )}
      </td>
      <td>{deviceApp(d)}</td>
      <td>{d.LastUserName}</td>
      <td className="cell-actions">
        {props.editing ? (
          <>
            <button type="button" className="icon-button" title="Save" aria-label="Save" onClick={() => props.onSave(draft)}>
              <Icon name="check" />
            </button>
            <button type="button" className="icon-button" title="Cancel" aria-label="Cancel" onClick={props.onCancel}>
              <Icon name="close" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="icon-button"
              title="Edit"
              aria-label={`Edit ${name}`}
              onClick={() => {
                setDraft(name);
                props.onEdit();
              }}
            >
              <Icon name="edit" />
            </button>
            <button
              type="button"
              className="icon-button is-danger"
              title={props.isCurrent ? undefined : 'Delete'}
              aria-label={`Delete ${name}`}
              disabled={props.isCurrent}
              onClick={props.onDelete}
            >
              <Icon name="delete" />
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
