import type { Api } from '../client';
import type { components } from '../schema';

export type Device = components['schemas']['DeviceInfoDto'];

/** GET /Devices: every device the signed-in administrator can see. */
export async function fetchDevices(api: Api): Promise<Device[]> {
  const { data, error } = await api.GET('/Devices');
  if (error !== undefined || !data) throw new Error('Failed to load devices');
  return data.Items ?? [];
}

/** The name the dashboard shows: the custom name when set, else the reported one. */
export function deviceName(d: Device): string {
  return d.CustomName || d.Name || d.Id || '';
}

/** App name and version, as jellyfin-web's App column. */
export function deviceApp(d: Device): string {
  return [d.AppName, d.AppVersion].filter(Boolean).join(' ');
}

/**
 * POST /Devices/Options: an empty name clears the custom name, so the
 * device shows its reported name again.
 */
export async function renameDevice(api: Api, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  const { error } = await api.POST('/Devices/Options', {
    params: { query: { id } },
    body: trimmed ? { CustomName: trimmed } : {},
  });
  if (error !== undefined) throw new Error('Saving the device name failed.');
}

/** Ids per DELETE request; keeps the query string short for long lists. */
const DELETE_BATCH = 50;

/** DELETE /Devices?id=…: signs the devices out and removes them. */
export async function deleteDevices(api: Api, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    const { error } = await api.DELETE('/Devices', { params: { query: { id: ids.slice(i, i + DELETE_BATCH) } } });
    if (error !== undefined) throw new Error('Deleting the device failed.');
  }
}

/** Delete All keeps the device in use, as jellyfin-web disables its delete button. */
export function deletableIds(devices: Device[], currentDeviceId: string): string[] {
  return devices.map((d) => d.Id).filter((id): id is string => !!id && id !== currentDeviceId);
}
