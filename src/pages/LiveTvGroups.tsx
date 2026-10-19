import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import type { Api } from '../api/client';
import {
  fetchM3UTuners,
  fetchTunerGroups,
  groupKey,
  initialFilter,
  keptChannels,
  saveTunerFilter,
  type GroupMode,
  type TunerHost,
} from '../api/liveTv';
import '../components/library-form.css';
import './home.css';
import './library.css';
import './search.css';
import './live-tv-groups.css';

/** Admin page: pick which M3U groups each tuner imports. */
export function LiveTvGroups() {
  const { session, api } = useAuth();
  const tuners = useQuery({
    queryKey: ['livetv-tuners', session?.serverUrl],
    enabled: !!api,
    queryFn: () => fetchM3UTuners(api!),
  });
  if (!session || !api) return null;

  return (
    <div className="home">
      <header className="home-bar library-bar">
        <Link to="/" className="library-back readout">
          ← home
        </Link>
        <h1 className="shelf-name">Live TV groups</h1>
      </header>
      <main className="home-main">
        {tuners.isError ? (
          <p className="home-status readout" role="alert">
            ▲ {tuners.error.message}
          </p>
        ) : !tuners.data ? (
          <p className="home-status readout">loading…</p>
        ) : tuners.data.length === 0 ? (
          <p className="home-status readout">no M3U tuners</p>
        ) : (
          tuners.data.map((t) => (
            <TunerGroupPicker key={t.Id} api={api} serverUrl={session.serverUrl} token={session.accessToken} tuner={t} />
          ))
        )}
      </main>
    </div>
  );
}

const MODES: { mode: GroupMode; label: string }[] = [
  { mode: 'all', label: 'all groups' },
  { mode: 'include', label: 'only checked' },
  { mode: 'exclude', label: 'all but checked' },
];

export function TunerGroupPicker({ api, serverUrl, token, tuner }: { api: Api; serverUrl: string; token: string; tuner: TunerHost }) {
  const queryClient = useQueryClient();
  const start = initialFilter(tuner);
  const [mode, setMode] = useState<GroupMode>(start.mode);
  const [selected, setSelected] = useState<string[]>(start.selected);
  const [text, setText] = useState('');
  const groups = useQuery({
    queryKey: ['livetv-groups', serverUrl, tuner.Id],
    queryFn: () => fetchTunerGroups(serverUrl, token, tuner.Id!),
  });
  const save = useMutation({
    mutationFn: () => saveTunerFilter(api, tuner, mode, selected),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['livetv-tuners', serverUrl] }),
  });

  const keys = useMemo(() => new Set(selected.map(groupKey)), [selected]);
  const list = groups.data?.Groups ?? [];
  const shown = text.trim() ? list.filter((g) => g.Name.toLowerCase().includes(text.trim().toLowerCase())) : list;
  const total = list.reduce((n, g) => n + g.Count, 0);
  const toggle = (name: string) =>
    setSelected((s) => (keys.has(groupKey(name)) ? s.filter((v) => groupKey(v) !== groupKey(name)) : [...s, name]));

  return (
    <section className="shelf tuner-groups" data-testid="tuner-groups">
      <h2 className="shelf-head">
        <span className="shelf-name">{tuner.FriendlyName || tuner.Url}</span>
        {groups.data?.Loaded && (
          <span className="readout" data-testid="kept-count">
            keeps {keptChannels(list, mode, selected)} of {total} channels
          </span>
        )}
      </h2>
      <div className="tuner-groups-modes" role="radiogroup" aria-label="Group filter">
        {MODES.map((m) => (
          <label key={m.mode} className="readout">
            <input type="radio" name={`mode-${tuner.Id}`} checked={mode === m.mode} onChange={() => setMode(m.mode)} />{' '}
            {m.label}
          </label>
        ))}
      </div>
      {groups.isError ? (
        <p className="login-error readout" role="alert">
          ▲ {groups.error.message}
        </p>
      ) : !groups.data ? (
        <p className="readout">loading…</p>
      ) : !groups.data.Loaded ? (
        <p className="readout">The playlist is not loaded yet. Run Refresh Guide, then reload this page.</p>
      ) : (
        <>
          <input
            className="search-input"
            type="search"
            aria-label="Find a group"
            placeholder={`Find among ${list.length} groups…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <ul className="tuner-groups-list">
            {shown.map((g) => (
              <li key={g.Name}>
                <label className="readout">
                  <input type="checkbox" disabled={mode === 'all'} checked={keys.has(groupKey(g.Name))} onChange={() => toggle(g.Name)} />{' '}
                  {g.Name || '(no group)'} <span className="tuner-groups-count">{g.Count}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="tuner-groups-actions">
        <button type="button" className="lib-button readout is-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'saving…' : 'save and refresh guide'}
        </button>
        {save.isSuccess && <span className="readout">saved; the guide refresh applies it</span>}
        {save.isError && (
          <span className="login-error readout" role="alert">
            ▲ {save.error.message}
          </span>
        )}
      </div>
    </section>
  );
}
