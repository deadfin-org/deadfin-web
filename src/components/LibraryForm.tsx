import { useEffect, useState, type FormEvent } from 'react';
import type { Api } from '../api/client';
import { LIBRARY_KINDS, listFolders, parentPath, type CollectionType, type Folder, type NewLibrary } from '../api/setup';
import './library-form.css';

/** Browse the server's folders; picking one fills the path. */
function FolderPicker({ api, start, onPick }: { api: Api; start: string; onPick: (path: string) => void }) {
  const [path, setPath] = useState(start || '/');
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFolders(null);
    setError(null);
    listFolders(api, path)
      .then((f) => live && setFolders(f))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Listing folders failed.'));
    return () => {
      live = false;
    };
  }, [api, path]);

  return (
    <div className="folder-picker" data-testid="folder-picker">
      <div className="folder-picker-head">
        <span className="readout folder-picker-path">{path}</span>
        <button type="button" className="lib-button readout" onClick={() => setPath(parentPath(path))} disabled={path === '/'}>
          ↑ up
        </button>
        <button type="button" className="lib-button readout is-primary" onClick={() => onPick(path)}>
          use this folder
        </button>
      </div>
      {error && (
        <p className="login-error readout" role="alert">
          ▲ {error}
        </p>
      )}
      {!folders && !error && <p className="readout">loading…</p>}
      {folders && folders.length === 0 && <p className="readout">no subfolders</p>}
      {folders && folders.length > 0 && (
        <ul className="folder-list">
          {folders.map((f) => (
            <li key={f.path}>
              <button type="button" className="folder-entry" onClick={() => setPath(f.path)}>
                ▸ {f.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Name, kind and folder for a new library. Used by the setup wizard and the
 * admin libraries page; the caller does the POST.
 */
export function LibraryForm({
  api,
  busy,
  onSubmit,
}: {
  api: Api;
  busy?: boolean;
  /** Resolves false when adding failed; the form then keeps what was typed. */
  onSubmit: (lib: NewLibrary) => Promise<boolean>;
}) {
  const [type, setType] = useState<CollectionType>('movies');
  const [name, setName] = useState('Movies');
  const [nameTouched, setNameTouched] = useState(false);
  const [path, setPath] = useState('');
  const [browsing, setBrowsing] = useState(false);

  function changeType(t: CollectionType) {
    setType(t);
    if (!nameTouched) setName(LIBRARY_KINDS.find((k) => k.value === t)?.label ?? '');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(await onSubmit({ name: name.trim(), type, paths: [path.trim()] }))) return;
    setPath('');
    setNameTouched(false);
    setName(LIBRARY_KINDS.find((k) => k.value === type)?.label ?? '');
  }

  return (
    <form className="library-form" onSubmit={submit} data-testid="library-form">
      <label className="field">
        <span className="readout">Content</span>
        <select value={type} onChange={(e) => changeType(e.target.value as CollectionType)}>
          {LIBRARY_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="readout">Library name</span>
        <input
          name="library-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          required
        />
      </label>
      <label className="field">
        <span className="readout">Folder on the server</span>
        <input
          name="library-path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/media/movies"
          spellCheck={false}
          required
        />
      </label>
      <button type="button" className="lib-button readout" onClick={() => setBrowsing((b) => !b)}>
        {browsing ? 'hide folders' : 'browse folders…'}
      </button>
      {browsing && (
        <FolderPicker
          api={api}
          start={path || '/'}
          onPick={(p) => {
            setPath(p);
            setBrowsing(false);
          }}
        />
      )}
      <button type="submit" className="lib-button readout is-primary" disabled={busy || !name.trim() || !path.trim()}>
        {busy ? 'adding…' : 'add library'}
      </button>
    </form>
  );
}
