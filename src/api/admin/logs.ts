import type { Api } from '../client';
import type { components } from '../schema';

export type LogFile = components['schemas']['LogFile'];

/** GET /System/Logs: the server's log files, newest first as the server sends them. */
export async function fetchLogFiles(api: Api): Promise<LogFile[]> {
  const { data, error } = await api.GET('/System/Logs');
  if (error !== undefined || !data) throw new Error('Failed to load the log files.');
  return data;
}

/** GET /System/Logs/Log?name=: one log file as text. */
export async function fetchLogFile(api: Api, name: string, signal?: AbortSignal): Promise<string> {
  const { data, error } = await api.GET('/System/Logs/Log', {
    params: { query: { name } },
    parseAs: 'text',
    signal,
  });
  if (error !== undefined || data === undefined) throw new Error('Failed to load the log file. It may still be actively written to.');
  return data;
}

/** The two slow-response settings the Logs page edits in /System/Configuration. */
export interface SlowResponseSettings {
  EnableSlowResponseWarning: boolean;
  SlowResponseThresholdMs: number;
}

export async function fetchSlowResponse(api: Api): Promise<SlowResponseSettings> {
  const { data, error } = await api.GET('/System/Configuration');
  if (error !== undefined || !data) throw new Error('Failed to load the server settings.');
  return {
    EnableSlowResponseWarning: data.EnableSlowResponseWarning ?? false,
    SlowResponseThresholdMs: data.SlowResponseThresholdMs ?? 500,
  };
}

/**
 * Reads the whole configuration again and posts it back with the two
 * fields changed, so a save does not undo other settings.
 */
export async function saveSlowResponse(api: Api, s: SlowResponseSettings): Promise<void> {
  const { data, error } = await api.GET('/System/Configuration');
  if (error !== undefined || !data) throw new Error('Failed to load the server settings.');
  const { error: postError } = await api.POST('/System/Configuration', { body: { ...data, ...s } });
  if (postError !== undefined) throw new Error('Saving the settings failed.');
}
