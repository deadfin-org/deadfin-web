import type { Api } from './client';

/** What a person types: '123 456' and '123-456' are the code 123456. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/**
 * Lets the device showing `code` sign in as this user. Throws a message to
 * show as-is when the server refuses.
 */
export async function authorizeQuickConnect(api: Api, code: string, userId: string): Promise<void> {
  const enabled = await api.GET('/QuickConnect/Enabled');
  if (enabled.error === undefined && enabled.data === false) {
    throw new Error('Quick Connect is turned off on this server. An administrator can turn it on in the server settings.');
  }
  const { data, error, response } = await api.POST('/QuickConnect/Authorize', {
    params: { query: { code, userId } },
  });
  if (error === undefined && data === true) return;
  if (response.status === 404 || (error === undefined && data === false)) {
    throw new Error('No device is waiting with that code. Codes expire after a few minutes; check the device and try again.');
  }
  if (response.status === 403) throw new Error('This account cannot authorize devices for that user.');
  throw new Error(`The server refused the code (HTTP ${response.status}).`);
}
