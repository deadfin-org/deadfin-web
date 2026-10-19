import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTunerGroups, groupKey, keptChannels, type GroupMode } from '../../../api/liveTv';
import { FormSection } from '../../../ui/Form';
import './livetv.css';

const MODES: { mode: GroupMode; label: string }[] = [
  { mode: 'all', label: 'All groups' },
  { mode: 'include', label: 'Only checked groups' },
  { mode: 'exclude', label: 'All but checked groups' },
];

/**
 * The M3U group filter of one tuner (Deadfin D-91). The tuner form holds
 * the state and saves it with the tuner; the groups come from the server's
 * cached playlist, so reading them does not download the playlist.
 */
export function TunerGroups(props: {
  serverUrl: string;
  token: string;
  tunerId: string;
  mode: GroupMode;
  selected: string[];
  onChange: (mode: GroupMode, selected: string[]) => void;
}) {
  const { mode, selected, onChange } = props;
  const [text, setText] = useState('');
  const groups = useQuery({
    queryKey: ['livetv-groups', props.serverUrl, props.tunerId],
    queryFn: () => fetchTunerGroups(props.serverUrl, props.token, props.tunerId),
  });

  const keys = useMemo(() => new Set(selected.map(groupKey)), [selected]);
  const list = groups.data?.Groups ?? [];
  const find = text.trim().toLowerCase();
  const shown = find ? list.filter((g) => g.Name.toLowerCase().includes(find)) : list;
  const total = list.reduce((n, g) => n + g.Count, 0);
  const toggle = (name: string) =>
    onChange(mode, keys.has(groupKey(name)) ? selected.filter((v) => groupKey(v) !== groupKey(name)) : [...selected, name]);

  return (
    <FormSection title="Channel groups">
      <div className="tuner-groups" data-testid="tuner-groups">
        <p className="form-help">
          Pick the playlist groups this tuner imports. The guide refresh after a save applies the filter.
          {groups.data?.Loaded && (
            <>
              {' '}
              <span data-testid="kept-count">
                Keeps {keptChannels(list, mode, selected)} of {total} channels.
              </span>
            </>
          )}
        </p>
        <div className="tuner-groups-modes" role="radiogroup" aria-label="Group filter">
          {MODES.map((m) => (
            <label key={m.mode}>
              <input type="radio" name="group-mode" checked={mode === m.mode} onChange={() => onChange(m.mode, selected)} />
              {m.label}
            </label>
          ))}
        </div>
        {groups.isError ? (
          <p className="form-error" role="alert">
            {groups.error.message}
          </p>
        ) : !groups.data ? (
          <p className="readout">Loading…</p>
        ) : !groups.data.Loaded ? (
          <p className="form-help">The playlist is not loaded yet. Run Refresh Guide Data, then reload this page.</p>
        ) : (
          <>
            <div className="form-field">
              <input
                type="search"
                aria-label="Find a group"
                placeholder={`Find among ${list.length} groups…`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </div>
            <ul className="tuner-groups-list">
              {shown.map((g) => (
                <li key={g.Name}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={mode === 'all'}
                      checked={keys.has(groupKey(g.Name))}
                      onChange={() => toggle(g.Name)}
                    />
                    {g.Name || '(no group)'} <span className="tuner-groups-count">{g.Count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </FormSection>
  );
}
