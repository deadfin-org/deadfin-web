import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Api } from '../../api/client';
import {
  addToCollection,
  addToPlaylist,
  createCollection,
  createPlaylist,
  deleteConfirmation,
  fetchCollections,
  fetchEditablePlaylists,
  refreshItem,
  type RefreshMode,
} from '../../api/items';
import type { BaseItem } from '../../api/library';

/**
 * A modal on the native <dialog> element: Escape and Cancel close it, focus
 * stays inside while it is open.
 */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; testId?: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    return () => {
      if (typeof el.close === 'function' && el.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={props.wide ? 'detail-dialog is-wide' : 'detail-dialog'}
      aria-labelledby={titleId}
      data-testid={props.testId}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
    >
      <div className="detail-dialog-head">
        <h2 id={titleId} className="detail-dialog-title">
          {props.title}
        </h2>
        <button type="button" className="detail-dialog-close" aria-label="Back" title="Back" onClick={props.onClose}>
          ×
        </button>
      </div>
      {props.children}
    </dialog>
  );
}

function ErrorLine(props: { error: unknown }) {
  if (!props.error) return null;
  return (
    <p className="form-error" role="alert">
      There was an error processing the request. Please try again later.
    </p>
  );
}

/** jellyfin-web collectionEditor: an existing collection, or New… with a name. */
export function AddToCollectionDialog(props: {
  api: Api;
  userId: string;
  item: BaseItem;
  onClose: () => void;
  onDone: (message: string, openId?: string) => void;
}) {
  const { api, userId, item } = props;
  const collections = useQuery({ queryKey: ['collections', userId], queryFn: () => fetchCollections(api, userId) });
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const selectId = useId();
  const nameId = useId();
  const save = useMutation({
    mutationFn: async () => {
      const ids = [item.Id ?? ''];
      if (target) {
        await addToCollection(api, target, ids);
        return { message: 'Items added.' };
      }
      return { message: '', openId: await createCollection(api, name.trim(), ids) };
    },
    onSuccess: (r) => props.onDone(r.message, r.openId),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target && !name.trim()) return;
    save.mutate();
  };
  return (
    <Modal title="Add to Collection" onClose={props.onClose} testId="collection-dialog">
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor={selectId}>Collection</label>
          <select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
            <option value="">New…</option>
            {(collections.data ?? []).map((c) => (
              <option key={c.Id} value={c.Id ?? ''}>
                {c.Name}
              </option>
            ))}
          </select>
        </div>
        {!target && (
          <>
            <p className="form-help">
              Collections allow you to create personalized groupings of movies and other library content.
            </p>
            <div className="form-field">
              <label htmlFor={nameId}>Name</label>
              <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} required />
              <p className="form-help">Example: Star Wars Collection</p>
            </div>
          </>
        )}
        <ErrorLine error={save.error} />
        <div className="detail-dialog-actions">
          <button type="submit" className="button-primary" disabled={save.isPending}>
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** jellyfin-web playlisteditor: a playlist the user can edit, or New… with a name and public access. */
export function AddToPlaylistDialog(props: {
  api: Api;
  userId: string;
  item: BaseItem;
  onClose: () => void;
  onDone: (message: string, openId?: string) => void;
}) {
  const { api, userId, item } = props;
  const playlists = useQuery({ queryKey: ['editable-playlists', userId], queryFn: () => fetchEditablePlaylists(api, userId) });
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [isPublic, setPublic] = useState(false);
  const selectId = useId();
  const nameId = useId();
  const save = useMutation({
    mutationFn: async () => {
      const ids = [item.Id ?? ''];
      if (target) {
        await addToPlaylist(api, userId, target, ids);
        return { message: 'Items added.' };
      }
      return { message: '', openId: await createPlaylist(api, userId, name.trim(), ids, isPublic) };
    },
    onSuccess: (r) => props.onDone(r.message, r.openId),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target && !name.trim()) return;
    save.mutate();
  };
  return (
    <Modal title="Add to Playlist" onClose={props.onClose} testId="playlist-dialog">
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor={selectId}>Playlist</label>
          <select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
            <option value="">New…</option>
            {(playlists.data ?? []).map((p) => (
              <option key={p.Id} value={p.Id ?? ''}>
                {p.Name}
              </option>
            ))}
          </select>
        </div>
        {!target && (
          <>
            <div className="form-field">
              <label htmlFor={nameId}>Name</label>
              <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <label className="form-check">
              <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
              <span>Allow public access</span>
            </label>
            <p className="form-help">Allow this playlist to be viewed by any logged in user.</p>
          </>
        )}
        <ErrorLine error={save.error} />
        <div className="detail-dialog-actions">
          <button type="submit" className="button-primary" disabled={save.isPending}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** jellyfin-web refreshdialog. */
export function RefreshDialog(props: { api: Api; item: BaseItem; onClose: () => void; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<RefreshMode>('scan');
  const [images, setImages] = useState(false);
  const [trickplay, setTrickplay] = useState(false);
  const modeId = useId();
  const run = useMutation({
    mutationFn: () => refreshItem(props.api, props.item.Id ?? '', mode, images, trickplay),
    onSuccess: () => props.onDone('Refresh queued.'),
  });
  return (
    <Modal title="Refresh metadata" onClose={props.onClose} testId="refresh-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="form-field">
          <label htmlFor={modeId}>Refresh mode</label>
          <select id={modeId} value={mode} onChange={(e) => setMode(e.target.value as RefreshMode)} autoFocus>
            <option value="scan">Scan for new and updated files</option>
            <option value="missing">Search for missing metadata</option>
            <option value="all">Replace all metadata</option>
          </select>
        </div>
        {mode !== 'scan' && (
          <>
            <label className="form-check">
              <input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} />
              <span>Replace existing images</span>
            </label>
            <label className="form-check">
              <input type="checkbox" checked={trickplay} onChange={(e) => setTrickplay(e.target.checked)} />
              <span>Replace existing trickplay images</span>
            </label>
          </>
        )}
        <p className="form-help">Metadata is refreshed based on settings and internet services that are enabled in the Dashboard.</p>
        <ErrorLine error={run.error} />
        <div className="detail-dialog-actions">
          <button type="submit" className="button-primary" disabled={run.isPending}>
            Refresh
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** jellyfin-web deleteHelper: the confirmation before DELETE /Items/{id}. */
export function DeleteDialog(props: { item: BaseItem; busy: boolean; error: unknown; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title="Delete Item" onClose={props.onClose} testId="delete-dialog">
      <p className="detail-dialog-text">{deleteConfirmation(props.item)}</p>
      <ErrorLine error={props.error} />
      <div className="detail-dialog-actions">
        <button type="button" className="action-toggle" onClick={props.onClose} autoFocus>
          Cancel
        </button>
        <button type="button" className="button-danger" disabled={props.busy} onClick={props.onConfirm}>
          Delete
        </button>
      </div>
    </Modal>
  );
}

type MediaSource = NonNullable<BaseItem['MediaSources']>[number];
type MediaStream = NonNullable<MediaSource['MediaStreams']>[number];

function bitrate(bps?: number | null): string {
  return bps ? `${Math.round(bps / 1000)} kbps` : '';
}

function size(bytes?: number | null): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(u > 1 ? 1 : 0)} ${units[u]}`;
}

function streamRows(s: MediaStream): [string, string][] {
  const rows: [string, string | number | null | undefined][] = [
    ['Title', s.DisplayTitle ?? s.Title],
    ['Language', s.Language],
    ['Codec', s.Codec?.toUpperCase()],
    ['Codec tag', s.CodecTag],
    ['Profile', s.Profile],
    ['Level', s.Level],
    ['Resolution', s.Width && s.Height ? `${s.Width}x${s.Height}` : ''],
    ['Aspect ratio', s.AspectRatio],
    ['Interlaced', s.Type === 'Video' ? (s.IsInterlaced ? 'Yes' : 'No') : ''],
    ['Framerate', s.RealFrameRate ? String(Math.round(s.RealFrameRate * 1000) / 1000) : ''],
    ['Bitrate', bitrate(s.BitRate)],
    ['Bit depth', s.BitDepth ? `${s.BitDepth} bit` : ''],
    ['Video range', s.VideoRange],
    ['Video range type', s.VideoRangeType],
    ['Color space', s.ColorSpace],
    ['Channels', s.Channels ? `${s.Channels} ch` : ''],
    ['Layout', s.ChannelLayout],
    ['Sample rate', s.SampleRate ? `${s.SampleRate} Hz` : ''],
    ['Default', s.Type !== 'Video' ? (s.IsDefault ? 'Yes' : 'No') : ''],
    ['Forced', s.Type === 'Subtitle' ? (s.IsForced ? 'Yes' : 'No') : ''],
    ['External', s.Type === 'Subtitle' ? (s.IsExternal ? 'Yes' : 'No') : ''],
  ];
  return rows.filter((r): r is [string, string | number] => r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v]) => [k, String(v)]);
}

/** jellyfin-web itemMediaInfo: each version, its container, path, size and streams. */
export function MediaInfoDialog(props: { item: BaseItem; onClose: () => void }) {
  const sources = props.item.MediaSources ?? [];
  return (
    <Modal title="Media Info" onClose={props.onClose} testId="media-info-dialog" wide>
      <div className="media-info">
        {sources.map((src) => (
          <div key={src.Id} className="media-info-source">
            {sources.length > 1 && <h3>{src.Name}</h3>}
            <dl className="kv-list">
              {src.Container && (
                <>
                  <dt>Container</dt>
                  <dd>{src.Container}</dd>
                </>
              )}
              {src.Path && (
                <>
                  <dt>Path</dt>
                  <dd>{src.Path}</dd>
                </>
              )}
              {src.Size ? (
                <>
                  <dt>Size</dt>
                  <dd>{size(src.Size)}</dd>
                </>
              ) : null}
              {src.Bitrate ? (
                <>
                  <dt>Bitrate</dt>
                  <dd>{bitrate(src.Bitrate)}</dd>
                </>
              ) : null}
            </dl>
            {(src.MediaStreams ?? []).map((s) => (
              <div key={`${s.Type}-${s.Index}`} className="media-info-stream">
                <h4>{s.Type}</h4>
                <dl className="kv-list">
                  {streamRows(s).map(([k, v]) => (
                    <div key={k} className="kv-row">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
