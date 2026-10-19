import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import { fetchLogFiles, fetchSlowResponse, saveSlowResponse, type SlowResponseSettings } from '../../api/admin/logs';
import { formatDateTime } from '../../lib/dateTime';
import { CheckboxField, Field, SaveBar } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import './logs.css';

/** Dashboard → Logs: the slow-response settings and the server's log files, as jellyfin-web. */
export function Logs() {
  const { session, api } = useAuth();
  if (!session || !api) return null;
  return <LogsPage api={api} serverUrl={session.serverUrl} />;
}

export function LogsPage(props: { api: Api; serverUrl: string }) {
  const { api, serverUrl } = props;
  const files = useQuery({
    queryKey: ['dashboard-logs', serverUrl],
    queryFn: () => fetchLogFiles(api),
    staleTime: 0,
  });
  return (
    <div data-testid="logs-page">
      <PageHeader title="Logs" />
      <SlowResponseForm api={api} serverUrl={serverUrl} />
      {files.isError ? (
        <p className="form-error" role="alert">
          {files.error.message}
        </p>
      ) : !files.data ? (
        <p className="readout">Loading…</p>
      ) : files.data.length === 0 ? (
        <p className="readout">No log files.</p>
      ) : (
        <ul className="log-list" data-testid="log-list">
          {files.data.map((f) => (
            <li key={f.Name}>
              <Link to={`/dashboard/logs/${encodeURIComponent(f.Name)}`} className="log-link">
                <span className="log-name">{f.Name}</span>
                <span className="log-date">{formatDateTime(f.DateModified)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlowResponseForm(props: { api: Api; serverUrl: string }) {
  const { api, serverUrl } = props;
  const stored = useQuery({
    queryKey: ['dashboard-slow-response', serverUrl],
    queryFn: () => fetchSlowResponse(api),
  });
  const [form, setForm] = useState<SlowResponseSettings | null>(null);
  useEffect(() => {
    if (stored.data && !form) setForm(stored.data);
  }, [stored.data, form]);
  const save = useMutation({ mutationFn: (s: SlowResponseSettings) => saveSlowResponse(api, s) });

  if (stored.isError) {
    return (
      <p className="form-error" role="alert">
        {stored.error.message}
      </p>
    );
  }
  if (!form) return <p className="readout">Loading…</p>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };
  return (
    <form className="form-section" onSubmit={submit} data-testid="slow-response-form">
      <CheckboxField
        label="Log a warning message if the server was slow to answer"
        checked={form.EnableSlowResponseWarning}
        onChange={(on) => setForm({ ...form, EnableSlowResponseWarning: on })}
      />
      <Field label="Time in ms after which a response is considered slow">
        {(id) => (
          <input
            id={id}
            type="number"
            min={0}
            value={form.SlowResponseThresholdMs}
            disabled={!form.EnableSlowResponseWarning}
            onChange={(e) => setForm({ ...form, SlowResponseThresholdMs: parseInt(e.target.value, 10) || 0 })}
          />
        )}
      </Field>
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
    </form>
  );
}
