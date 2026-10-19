import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import type { components } from '../../api/schema';
import { Field, SaveBar } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import './settings.css';

export type ServerConfiguration = components['schemas']['ServerConfiguration'];

/** GET /System/Configuration/{key}; `key` is a named configuration such as `encoding`. */
export async function fetchNamedConfiguration<T>(api: Api, key: string): Promise<T> {
  const { data, error } = await api.GET('/System/Configuration/{key}', { params: { path: { key } } });
  if (error !== undefined) throw new Error(`Loading the ${key} settings failed.`);
  return data as T;
}

/**
 * POST /System/Configuration/{key}. The body is the stored configuration
 * with the page's changes on top, so fields the page does not show keep
 * their stored values.
 */
export async function saveNamedConfiguration<T extends object>(api: Api, key: string, changes: Partial<T>): Promise<T> {
  const stored = await fetchNamedConfiguration<T>(api, key);
  const body = { ...stored, ...changes };
  const { error } = await api.POST('/System/Configuration/{key}', { params: { path: { key } }, body });
  if (error !== undefined) throw new Error('Saving the settings failed.');
  return body;
}

export async function fetchServerConfiguration(api: Api): Promise<ServerConfiguration> {
  const { data, error } = await api.GET('/System/Configuration');
  if (error !== undefined || !data) throw new Error('Loading the server settings failed.');
  return data;
}

/**
 * POST /System/Configuration after `change` edits a fresh copy of the
 * stored configuration, as jellyfin-web's playback pages do: a page writes
 * only its own fields.
 */
export async function saveServerConfiguration(
  api: Api,
  change: (config: ServerConfiguration) => ServerConfiguration,
): Promise<ServerConfiguration> {
  const body = change(await fetchServerConfiguration(api));
  const { error } = await api.POST('/System/Configuration', { body });
  if (error !== undefined) throw new Error('Saving the settings failed.');
  return body;
}

/** A settings page's load, editable copy, and save. `key` null means the server configuration. */
export function useSettings<T extends object>(
  key: string | null,
  save: (api: Api, draft: T) => Promise<unknown>,
): { draft: T | null; set: (changes: Partial<T>) => void; query: { isError: boolean; error: Error | null }; mutation: UseMutationResult<unknown, Error, void> } {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['configuration', session?.serverUrl, key ?? 'server'];
  const query = useQuery({
    queryKey,
    enabled: !!api,
    queryFn: () => (key ? fetchNamedConfiguration<T>(api!, key) : (fetchServerConfiguration(api!) as Promise<T>)),
  });
  const [draft, setDraft] = useState<T | null>(null);
  useEffect(() => {
    if (query.data && draft === null) setDraft(query.data);
  }, [query.data, draft]);
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: () => save(api!, draft!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const set = (changes: Partial<T>) => {
    mutation.reset();
    setDraft((d) => (d ? { ...d, ...changes } : d));
  };
  return { draft, set, query, mutation };
}

/** The frame of one dashboard settings page: title, load state, form, and Save. */
export function SettingsForm(props: {
  title: string;
  testId: string;
  loadError: string;
  query: { isError: boolean };
  ready: boolean;
  mutation: UseMutationResult<unknown, Error, void>;
  children: ReactNode;
}) {
  const { mutation } = props;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  return (
    <>
      <PageHeader title={props.title} />
      {props.query.isError ? (
        <p className="form-error" role="alert">
          {props.loadError}
        </p>
      ) : !props.ready ? (
        <p className="readout">Loading…</p>
      ) : (
        <form className="settings-form" data-testid={props.testId} onSubmit={submit}>
          {props.children}
          <SaveBar busy={mutation.isPending} error={mutation.error?.message} saved={mutation.isSuccess} />
        </form>
      )}
    </>
  );
}

/** A text box; `onChange` gets the text. */
export function TextField(props: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  help?: ReactNode;
  type?: 'text' | 'password' | 'url';
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={props.label} help={props.help}>
      {(id) => (
        <input
          id={id}
          type={props.type ?? 'text'}
          value={props.value ?? ''}
          disabled={props.disabled}
          required={props.required}
          placeholder={props.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** A number box; an empty box gives `null`. */
export function NumberField(props: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  help?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={props.label} help={props.help}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={props.value ?? ''}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          required={props.required}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )}
    </Field>
  );
}

/** A select; options are [value, label] pairs. */
export function SelectField(props: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field label={props.label} help={props.help}>
      {(id) => (
        <select id={id} value={props.value ?? ''} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
          {props.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Comma-separated text of a list, as jellyfin-web shows LAN networks and proxies. */
export function joinList(list: string[] | null | undefined, sep = ', '): string {
  return (list ?? []).join(sep);
}

/** The items of comma-separated text: trimmed, empty items dropped. */
export function splitList(text: string, sep = ','): string[] {
  return text
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
