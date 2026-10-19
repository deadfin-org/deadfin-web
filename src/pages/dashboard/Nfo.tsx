import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import { fetchNamedConfiguration, saveNamedConfiguration } from '../../api/admin/system';
import { fetchUsers } from '../../api/admin/users';
import { CheckboxField, Field, SaveBar } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import './dashboard.css';

/** The `xbmcmetadata` configuration section (Kodi NFO files). */
export type NfoConfig = {
  UserId?: string | null;
  ReleaseDateFormat?: string;
  SaveImagePathsInNfo?: boolean;
  EnablePathSubstitution?: boolean;
  EnableExtraThumbsDuplication?: boolean;
};

/** NFO Settings, as jellyfin-web `#/dashboard/libraries/nfo` (needs deadfin#741 on Deadfin). */
export function Nfo() {
  const { api } = useAuth();
  const config = useQuery({
    queryKey: ['admin', 'xbmcmetadata'],
    queryFn: () => fetchNamedConfiguration<NfoConfig>(api!, 'xbmcmetadata'),
    retry: false,
  });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => fetchUsers(api!) });
  const [form, setForm] = useState<NfoConfig | null>(null);
  useEffect(() => {
    if (config.data && !form) setForm(config.data);
  }, [config.data, form]);
  const save = useMutation({
    mutationFn: async (f: NfoConfig) => {
      // Keep fields this page does not show (ReleaseDateFormat).
      const current = await fetchNamedConfiguration<NfoConfig>(api!, 'xbmcmetadata');
      await saveNamedConfiguration(api!, 'xbmcmetadata', { ...current, ...f, UserId: f.UserId || null });
    },
  });
  const set = (patch: Partial<NfoConfig>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    save.reset();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form) save.mutate(form);
  };
  if (config.isError)
    return (
      <>
        <PageHeader title="NFO Settings" />
        <p className="form-error" role="alert" data-testid="nfo-error">
          Failed to load metadata NFO settings. {config.error.message}
        </p>
      </>
    );
  if (!form) return <p className="form-help">Loading…</p>;
  return (
    <form onSubmit={submit} className="dash-form" data-testid="nfo-form">
      <PageHeader title="NFO Settings" />
      <p className="form-help">To enable or disable NFO metadata, edit a library and find the 'Metadata savers' section.</p>
      <Field label="Save user watch data to NFO files for" help="Save watch data to NFO files for other applications to use.">
        {(id) => (
          <select id={id} value={form.UserId ?? ''} onChange={(e) => set({ UserId: e.target.value })}>
            <option value="">None</option>
            {(users.data ?? []).map((u) => (
              <option key={u.Id} value={u.Id}>
                {u.Name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <CheckboxField
        label="Save image paths within NFO files"
        help="This is recommended if you have image file names that don't conform to Kodi guidelines."
        checked={!!form.SaveImagePathsInNfo}
        onChange={(v) => set({ SaveImagePathsInNfo: v })}
      />
      <CheckboxField
        label="Enable path substitution"
        help="Enable path substitution of image paths using the server's path substitution settings."
        checked={!!form.EnablePathSubstitution}
        onChange={(v) => set({ EnablePathSubstitution: v })}
      />
      <CheckboxField
        label="Copy extrafanart to extrathumbs field"
        help="When downloading images they can be saved into both extrafanart and extrathumbs for maximum Kodi skin compatibility."
        checked={!!form.EnableExtraThumbsDuplication}
        onChange={(v) => set({ EnableExtraThumbsDuplication: v })}
      />
      <p className="form-help">
        Changing metadata settings will affect new content added going forward. To refresh existing content, open the detail screen
        and click the 'Refresh' button.
      </p>
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
    </form>
  );
}
