import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import {
  addMediaPath,
  addVirtualFolder,
  COLLECTION_TYPES,
  collectionTypeLabel,
  defaultLibraryOptions,
  deletePrimaryImage,
  fetchAvailableOptions,
  fetchVirtualFolders,
  libraryImageUrl,
  refreshLibrary,
  removeMediaPath,
  removeVirtualFolder,
  renameVirtualFolder,
  updateLibraryOptions,
  uploadPrimaryImage,
  type LibraryOptions,
  type RefreshMode,
  type VirtualFolder,
} from '../../api/admin/libraries';
import { ConfirmDialog, Dialog, InputDialog } from '../../ui/Modal';
import { CheckboxField, Field } from '../../ui/Form';
import { PageHeader } from '../../ui/PageHeader';
import { useScanAll } from './DashboardHome';
import { LibraryOptionsEditor } from './LibraryOptionsEditor';
import { SelectPathDialog } from './PathField';
import { TaskProgress } from './Tasks';
import './dashboard.css';

const FOLDERS_KEY = ['admin', 'virtual-folders'];

/** Library cards with Add Media Library and Scan All Libraries, as jellyfin-web `#/dashboard/libraries`. */
export function Libraries() {
  const { api, session } = useAuth();
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: FOLDERS_KEY, queryFn: () => fetchVirtualFolders(api!) });
  const { task, scan, scanning } = useScanAll(api!);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<VirtualFolder | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    void queryClient.invalidateQueries({ queryKey: ['user-views'] });
  };
  // Keep the open editor on the newest copy (folders added or removed).
  const current = editing && (folders.data?.find((f) => f.ItemId === editing.ItemId) ?? editing);
  return (
    <>
      <PageHeader title="Libraries" />
      <div className="dash-actions">
        <button type="button" className="button-primary" onClick={() => setAdding(true)}>
          + Add Media Library
        </button>
        <button type="button" className="button-plain" disabled={!task || scanning || scan.isPending} onClick={() => scan.mutate()}>
          {scanning ? 'Scanning…' : 'Scan All Libraries'}
        </button>
        {task?.State === 'Running' && <TaskProgress task={task} />}
      </div>
      {folders.isError ? (
        <p className="form-error" role="alert">
          Failed to load libraries. {folders.error.message}
        </p>
      ) : !folders.data ? (
        <p className="form-help">Loading…</p>
      ) : folders.data.length === 0 ? (
        <p className="form-help">No libraries yet. Add a media library to start.</p>
      ) : (
        <div className="library-cards" data-testid="library-cards">
          {folders.data.map((f) => (
            <LibraryCard key={f.ItemId ?? f.Name} folder={f} serverUrl={session!.serverUrl} onEdit={() => setEditing(f)} onChanged={refresh} />
          ))}
        </div>
      )}
      {adding && (
        <LibraryEditor
          onClose={(changed) => {
            setAdding(false);
            if (changed) refresh();
          }}
        />
      )}
      {current && (
        <LibraryEditor
          folder={current}
          onFoldersChanged={refresh}
          onClose={(changed) => {
            setEditing(null);
            if (changed) refresh();
          }}
        />
      )}
    </>
  );
}

type CardDialog = 'rename' | 'remove' | 'scan' | 'image' | null;

function LibraryCard(props: { folder: VirtualFolder; serverUrl: string; onEdit: () => void; onChanged: () => void }) {
  const { api } = useAuth();
  const f = props.folder;
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<CardDialog>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const rename = useMutation({
    mutationFn: (name: string) => renameVirtualFolder(api!, f.Name!, name),
    onSuccess: () => {
      setDialog(null);
      props.onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeVirtualFolder(api!, f.Name!),
    onSuccess: () => {
      setDialog(null);
      props.onChanged();
    },
  });
  const open = (d: CardDialog) => {
    setMenu(false);
    setDialog(d);
  };
  const img = libraryImageUrl(props.serverUrl, f);
  return (
    <div className="library-card" data-testid="library-card">
      <button type="button" className="library-card-image" onClick={props.onEdit} aria-label={`Manage library ${f.Name}`}>
        {img ? <img src={img} alt="" loading="lazy" /> : <span aria-hidden="true">{(f.Name ?? '?').slice(0, 1).toUpperCase()}</span>}
      </button>
      <div className="user-card-footer">
        <div className="user-card-text">
          <div className="user-card-name">{f.Name}</div>
          <div className="form-help">{collectionTypeLabel(f.CollectionType)}</div>
          {f.RefreshStatus && f.RefreshStatus !== 'Idle' && <div className="form-help">{f.RefreshStatus}</div>}
        </div>
        <div className="user-card-menu" ref={menuRef}>
          <button
            type="button"
            className="modal-close"
            aria-label={`Menu for ${f.Name}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            ⋮
          </button>
          {menu && (
            <div className="card-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => open('image')}>
                Edit images
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  props.onEdit();
                }}
              >
                Manage library
              </button>
              <button type="button" role="menuitem" onClick={() => open('rename')}>
                Rename
              </button>
              <button type="button" role="menuitem" onClick={() => open('scan')}>
                Scan library
              </button>
              <button type="button" role="menuitem" onClick={() => open('remove')}>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
      {dialog === 'rename' && (
        <InputDialog
          title="Rename"
          label="New name"
          help="Renaming a media library will cause all metadata to be lost, proceed with caution."
          initial={f.Name ?? ''}
          confirmText="Rename"
          busy={rename.isPending}
          error={rename.isError ? rename.error.message : null}
          onConfirm={(name) => rename.mutate(name)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'remove' && (
        <ConfirmDialog
          title="Remove Media Folder"
          text={`Are you sure you wish to remove this media folder?\n\nThe following media locations will be removed from your library:\n\n${(f.Locations ?? []).join('\n')}`}
          confirmText="Delete"
          danger
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'scan' && <ScanDialog folder={f} onClose={() => setDialog(null)} />}
      {dialog === 'image' && (
        <ImageDialog
          folder={f}
          serverUrl={props.serverUrl}
          onClose={(changed) => {
            setDialog(null);
            if (changed) props.onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Scan one library, as jellyfin-web's refresh dialog in scan mode. */
function ScanDialog({ folder, onClose }: { folder: VirtualFolder; onClose: () => void }) {
  const { api } = useAuth();
  const [mode, setMode] = useState<RefreshMode>('scan');
  const [replaceImages, setReplaceImages] = useState(false);
  const run = useMutation({ mutationFn: () => refreshLibrary(api!, folder.ItemId!, mode, replaceImages) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run.mutate();
  };
  return (
    <Dialog title="Scan library" onClose={onClose} testId="scan-dialog">
      <form onSubmit={submit}>
        <Field label="Refresh mode">
          {(id) => (
            <select id={id} value={mode} onChange={(e) => setMode(e.target.value as RefreshMode)}>
              <option value="scan">Scan for new and updated files</option>
              <option value="missing">Search for missing metadata</option>
              <option value="all">Replace all metadata</option>
            </select>
          )}
        </Field>
        {mode !== 'scan' && <CheckboxField label="Replace existing images" checked={replaceImages} onChange={setReplaceImages} />}
        <p className="form-help">Metadata is refreshed based on settings and internet services that are enabled in the Dashboard.</p>
        {run.isError && (
          <p className="form-error" role="alert">
            {run.error.message}
          </p>
        )}
        {run.isSuccess && <p role="status">Refresh queued.</p>}
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={onClose}>
            {run.isSuccess ? 'Close' : 'Cancel'}
          </button>
          {!run.isSuccess && (
            <button type="submit" className="button-primary" disabled={run.isPending}>
              Refresh
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** Edit Images for a library: upload or delete its primary image. */
function ImageDialog(props: { folder: VirtualFolder; serverUrl: string; onClose: (changed: boolean) => void }) {
  const { api } = useAuth();
  const [changed, setChanged] = useState(false);
  const [version, setVersion] = useState(0);
  const upload = useMutation({
    mutationFn: (file: File) => uploadPrimaryImage(api!, props.folder.ItemId!, file),
    onSuccess: () => {
      setChanged(true);
      setVersion((v) => v + 1);
    },
  });
  const remove = useMutation({
    mutationFn: () => deletePrimaryImage(api!, props.folder.ItemId!),
    onSuccess: () => {
      setChanged(true);
      setVersion((v) => v + 1);
    },
  });
  const hasImage = (props.folder.PrimaryImageItemId && version === 0) || upload.isSuccess;
  const src = hasImage && !remove.isSuccess
    ? `${props.serverUrl}/Items/${props.folder.ItemId}/Images/Primary?fillWidth=480&quality=90&v=${version}`
    : '';
  const error = upload.error ?? remove.error;
  return (
    <Dialog title="Edit Images" onClose={() => props.onClose(changed)} testId="image-dialog">
      <div className="image-edit">
        <div className="library-card-image">{src ? <img src={src} alt="Primary" /> : <span aria-hidden="true">—</span>}</div>
        <div className="dash-actions">
          <label className="button-plain">
            Upload
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
          </label>
          {src && (
            <button type="button" className="button-alarm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete Image
            </button>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Add Media Library (no `folder`) or Manage library (with `folder`). Adding
 * collects content type, name, folders and options and creates it on OK. When
 * managing, folder changes apply at once (as jellyfin-web) and OK saves the
 * options.
 */
export function LibraryEditor(props: { folder?: VirtualFolder; onClose: (changed: boolean) => void; onFoldersChanged?: () => void }) {
  const { api } = useAuth();
  const editing = !!props.folder;
  const [type, setType] = useState<string>(props.folder ? props.folder.CollectionType || 'mixed' : '');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [options, setOptions] = useState<LibraryOptions>(() => props.folder?.LibraryOptions ?? defaultLibraryOptions());
  const [picking, setPicking] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const available = useQuery({
    queryKey: ['admin', 'available-options', type, !editing],
    queryFn: () => fetchAvailableOptions(api!, type, !editing),
    enabled: !!type,
    staleTime: 5 * 60_000,
  });
  const locations = editing ? (props.folder!.Locations ?? []) : paths;

  const save = useMutation({
    mutationFn: async () => {
      const clean = { ...options, DelimiterWhitelist: (options.DelimiterWhitelist ?? []).filter((s) => s.trim()) };
      if (editing) await updateLibraryOptions(api!, props.folder!.ItemId!, clean);
      else await addVirtualFolder(api!, { name: name.trim(), type, paths, options: clean });
    },
    onSuccess: () => props.onClose(true),
  });
  const addPath = useMutation({
    mutationFn: (p: string) => addMediaPath(api!, props.folder!.Name!, p),
    onSuccess: () => props.onFoldersChanged?.(),
  });
  const removePath = useMutation({
    mutationFn: (p: string) => removeMediaPath(api!, props.folder!.Name!, p),
    onSuccess: () => {
      setRemovingPath(null);
      props.onFoldersChanged?.();
    },
  });

  const pick = (p: string) => {
    setPicking(false);
    if (editing) addPath.mutate(p);
    else if (!paths.includes(p)) setPaths([...paths, p]);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) {
      if (!type) return setProblem('Choose a content type.');
      if (!name.trim()) return setProblem('Library name cannot be empty.');
      if (paths.length === 0) return setProblem("Please add at least one folder to this library by clicking the '+' button in 'Folders' section.");
    }
    setProblem(null);
    save.mutate();
  };
  const error = problem ?? save.error?.message ?? addPath.error?.message ?? null;
  return (
    <Dialog
      title={editing ? (props.folder!.Name ?? '') : 'Add Media Library'}
      onClose={() => props.onClose(false)}
      wide
      testId="library-editor"
    >
      <form onSubmit={submit}>
        {editing ? (
          <p className="form-help">
            Changes to metadata or artwork downloading settings will only apply to new content added to your library. To apply the
            changes to existing titles, you'll need to refresh their metadata manually.
          </p>
        ) : (
          <>
            <Field label="Content type">
              {(id) => (
                <select
                  id={id}
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    if (!nameTouched) setName(COLLECTION_TYPES.find((t) => t.value === e.target.value)?.label ?? '');
                  }}
                  required
                >
                  <option value=""></option>
                  {COLLECTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Display name">
              {(id) => (
                <input
                  id={id}
                  name="library-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  required
                />
              )}
            </Field>
          </>
        )}
        <div className="folders-head">
          <h3 className="form-section-title">Folders</h3>
          <button type="button" className="button-plain" aria-label="Add folder" onClick={() => setPicking(true)}>
            +
          </button>
        </div>
        <ul className="tag-list" data-testid="library-folders">
          {locations.map((p) => (
            <li key={p}>
              <span className="dash-path">{p}</span>
              <button
                type="button"
                className="button-plain"
                aria-label={`Remove ${p}`}
                onClick={() => (editing ? setRemovingPath(p) : setPaths(paths.filter((x) => x !== p)))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {type && (
          <LibraryOptionsEditor contentType={type} options={options} available={available.data} onChange={setOptions} />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={() => props.onClose(false)}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={save.isPending}>
            OK
          </button>
        </div>
      </form>
      {picking && <SelectPathDialog start="/" onPick={pick} onCancel={() => setPicking(false)} />}
      {removingPath && (
        <ConfirmDialog
          title="Remove Media Location"
          text="Are you sure you wish to remove this location?"
          confirmText="Delete"
          danger
          busy={removePath.isPending}
          error={removePath.isError ? removePath.error.message : null}
          onConfirm={() => removePath.mutate(removingPath)}
          onCancel={() => setRemovingPath(null)}
        />
      )}
    </Dialog>
  );
}
