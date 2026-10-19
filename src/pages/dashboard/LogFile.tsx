import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import { fetchLogFile } from '../../api/admin/logs';
import { Icon } from '../../ui/Icon';
import '../../ui/table.css';
import './logs.css';

/** Seconds between reloads while Watch is on, as jellyfin-web. */
export const WATCH_INTERVAL_MS = 2000;

/** Dashboard → Logs → one file: the text, with Copy, Download and Watch. */
export function LogFile() {
  const { file } = useParams<{ file: string }>();
  const { session, api } = useAuth();
  if (!session || !api || !file) return null;
  return <LogFileView api={api} serverUrl={session.serverUrl} name={file} />;
}

export function LogFileView(props: { api: Api; serverUrl: string; name: string }) {
  const { api, serverUrl, name } = props;
  const [watch, setWatch] = useState(false);
  const [copied, setCopied] = useState(false);
  const log = useQuery({
    queryKey: ['dashboard-log', serverUrl, name],
    queryFn: ({ signal }) => fetchLogFile(api, name, signal),
    refetchInterval: watch ? WATCH_INTERVAL_MS : false,
    staleTime: 0,
  });

  // While watching, new lines keep the view at the end if it was there.
  const atBottom = useRef(false);
  const toBottom = useCallback(() => window.scrollTo(0, document.documentElement.scrollHeight), []);
  useEffect(() => {
    const onScroll = () => {
      atBottom.current = window.innerHeight + Math.round(window.scrollY) >= document.documentElement.scrollHeight - 5;
    };
    document.addEventListener('scroll', onScroll);
    return () => document.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (watch && atBottom.current) toBottom();
  }, [log.data, watch, toBottom]);

  const toggleWatch = () => {
    setWatch((w) => !w);
    if (!watch) {
      atBottom.current = true;
      toBottom();
    }
  };
  const copy = async () => {
    if (log.data === undefined) return;
    await navigator.clipboard.writeText(log.data);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 3000);
  };
  const download = () => {
    if (log.data === undefined) return;
    const url = URL.createObjectURL(new Blob([log.data], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buttons = (
    <div className="log-buttons">
      <button type="button" className="button-outline" onClick={() => void copy()}>
        <Icon name="copy" />
        Copy
      </button>
      <button type="button" className="button-outline" onClick={download}>
        <Icon name="download" />
        Download
      </button>
      <button type="button" className="button-outline" aria-pressed={watch} onClick={toggleWatch}>
        <Icon name={watch ? 'unwatch' : 'watch'} />
        {watch ? 'Unwatch' : 'Watch'}
      </button>
    </div>
  );

  return (
    <div data-testid="log-file-page">
      <h1 className="page-title log-file-title">{name}</h1>
      {log.isError ? (
        <div className="form-error log-error" role="alert">
          {log.error.message}{' '}
          <button type="button" className="button-text" onClick={() => void log.refetch()}>
            Retry
          </button>
        </div>
      ) : log.isPending ? (
        <p className="readout">Loading…</p>
      ) : (
        <>
          {buttons}
          <pre className="log-text" data-testid="log-text">
            <code>{log.data}</code>
          </pre>
          {buttons}
        </>
      )}
      {copied && (
        <p className="log-toast" role="status">
          Log contents copied successfully.
        </p>
      )}
    </div>
  );
}
