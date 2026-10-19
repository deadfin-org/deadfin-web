import type { Api } from '../client';
import type { components } from '../schema';

export type ApiKey = components['schemas']['AuthenticationInfo'];

/** GET /Auth/Keys. */
export async function fetchApiKeys(api: Api): Promise<ApiKey[]> {
  const { data, error } = await api.GET('/Auth/Keys');
  if (error !== undefined || !data) throw new Error('Failed to load API keys');
  return data.Items ?? [];
}

/** POST /Auth/Keys?app=: the server answers 204; the new key shows on the next list. */
export async function createApiKey(api: Api, app: string): Promise<void> {
  const { error } = await api.POST('/Auth/Keys', { params: { query: { app: app.trim() } } });
  if (error !== undefined) throw new Error('Creating the API key failed.');
}

/** DELETE /Auth/Keys/{key}. */
export async function revokeApiKey(api: Api, key: string): Promise<void> {
  const { error } = await api.DELETE('/Auth/Keys/{key}', { params: { path: { key } } });
  if (error !== undefined) throw new Error('Revoking the API key failed.');
}
