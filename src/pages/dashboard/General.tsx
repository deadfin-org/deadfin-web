import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import { fetchConfiguration, fetchLocalizationOptions, saveConfiguration } from '../../api/admin/system';
import { CheckboxField, Field, FormSection, SaveBar } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import { PathField } from './PathField';
import './dashboard.css';

type Form = {
  ServerName: string;
  UICulture: string;
  CachePath: string;
  MetadataPath: string;
  QuickConnectAvailable: boolean;
  LibraryScanFanoutConcurrency: string;
  ParallelImageEncodingLimit: string;
};

/** General settings, as jellyfin-web `#/dashboard/settings`. */
export function General() {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['admin', 'configuration'], queryFn: () => fetchConfiguration(api!) });
  const cultures = useQuery({ queryKey: ['admin', 'localization-options'], queryFn: () => fetchLocalizationOptions(api!), staleTime: Infinity });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    const c = config.data;
    if (!c || form) return;
    setForm({
      ServerName: c.ServerName ?? '',
      UICulture: c.UICulture ?? 'en-US',
      CachePath: c.CachePath ?? '',
      MetadataPath: c.MetadataPath ?? '',
      QuickConnectAvailable: !!c.QuickConnectAvailable,
      LibraryScanFanoutConcurrency: c.LibraryScanFanoutConcurrency ? String(c.LibraryScanFanoutConcurrency) : '',
      ParallelImageEncodingLimit: c.ParallelImageEncodingLimit ? String(c.ParallelImageEncodingLimit) : '',
    });
  }, [config.data, form]);
  const save = useMutation({
    mutationFn: (f: Form) =>
      saveConfiguration(api!, {
        ServerName: f.ServerName,
        UICulture: f.UICulture,
        CachePath: f.CachePath,
        MetadataPath: f.MetadataPath,
        QuickConnectAvailable: f.QuickConnectAvailable,
        LibraryScanFanoutConcurrency: parseInt(f.LibraryScanFanoutConcurrency || '0', 10) || 0,
        ParallelImageEncodingLimit: parseInt(f.ParallelImageEncodingLimit || '0', 10) || 0,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['system-info', session?.serverUrl] });
    },
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    save.reset();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form) save.mutate(form);
  };

  if (config.isError)
    return (
      <p className="form-error" role="alert">
        The settings could not be loaded. {config.error.message}
      </p>
    );
  if (!form) return <p className="form-help">Loading…</p>;
  const languages = cultures.data ?? [];
  return (
    <form onSubmit={submit} className="dash-form" data-testid="settings-form">
      <PageHeader title="Settings" />
      <FormSection title="Server">
        <Field label="Server name" help="This name will be used to identify the server and will default to the server's hostname.">
          {(id) => <input id={id} name="ServerName" value={form.ServerName} onChange={(e) => set('ServerName', e.target.value)} />}
        </Field>
        <Field label="Preferred display language" help="Translating Jellyfin is an ongoing project.">
          {(id) => (
            <select id={id} name="UICulture" value={form.UICulture} onChange={(e) => set('UICulture', e.target.value)}>
              {!languages.some((l) => l.Value === form.UICulture) && <option value={form.UICulture}>{form.UICulture}</option>}
              {languages.map((l) => (
                <option key={l.Value ?? l.Name} value={l.Value ?? ''}>
                  {l.Name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </FormSection>
      <FormSection title="Paths">
        <PathField
          label="Cache path"
          name="CachePath"
          help="Specify a custom location for server cache files such as images. Leave blank to use the server default."
          pickerTitle="Select Server Cache Path"
          value={form.CachePath}
          onChange={(v) => set('CachePath', v)}
        />
        <PathField
          label="Metadata path"
          name="MetadataPath"
          help="Specify a custom location for downloaded artwork and metadata."
          pickerTitle="Select Metadata Path"
          value={form.MetadataPath}
          onChange={(v) => set('MetadataPath', v)}
        />
      </FormSection>
      <FormSection title="Quick Connect">
        <CheckboxField
          label="Enable Quick Connect on this server"
          checked={form.QuickConnectAvailable}
          onChange={(v) => set('QuickConnectAvailable', v)}
        />
      </FormSection>
      <FormSection title="Performance">
        <Field
          label="Parallel library scan tasks limit"
          help="Maximum number of parallel tasks during library scans. Leaving this empty will choose a limit based on your systems core count. Setting this number too high may cause issues with network file systems."
        >
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              step={1}
              value={form.LibraryScanFanoutConcurrency}
              onChange={(e) => set('LibraryScanFanoutConcurrency', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Parallel image encoding limit"
          help="Maximum number of image encodings that are allowed to run in parallel. Leaving this empty will choose a limit based on your systems core count."
        >
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              step={1}
              value={form.ParallelImageEncodingLimit}
              onChange={(e) => set('ParallelImageEncodingLimit', e.target.value)}
            />
          )}
        </Field>
      </FormSection>
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
    </form>
  );
}
