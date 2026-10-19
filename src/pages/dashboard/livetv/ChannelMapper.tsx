import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import { fetchChannelMappingOptions, setChannelMapping, type ChannelMappingOptions } from '../../../api/liveTv';
import './livetv.css';

/** Rows added per step as the list scrolls; the playlist can hold tens of thousands of channels. */
export const MAP_PAGE = 100;
/** Guide channels a picker shows for its search text. */
const PICK_LIMIT = 50;

type Mapped = { name: string | null | undefined; id: string | null | undefined };

/**
 * Map Channels, as jellyfin-web components/channelMapper: each tuner
 * channel with the guide channel it takes listings from. The list streams
 * as it scrolls and filters by name, so a 40k-channel tuner stays fast.
 */
export function ChannelMapper(props: { providerId: string; onClose: () => void }) {
  const { api, session } = useAuth();
  const options = useQuery({
    queryKey: ['channel-mapping-options', session?.serverUrl, props.providerId],
    enabled: !!api,
    queryFn: () => fetchChannelMappingOptions(api!, props.providerId),
    staleTime: 0,
    gcTime: 0,
  });
  const close = useRef<HTMLButtonElement>(null);
  const { onClose } = props;
  useEffect(() => close.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="map-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="map-dialog channel-map" role="dialog" aria-modal="true" aria-labelledby="map-title" data-testid="channel-mapper">
        <div className="dash-row">
          <button ref={close} type="button" className="dash-button" onClick={onClose} aria-label="Back">
            ←
          </button>
          <h2 id="map-title" className="form-section-title" style={{ margin: 0 }}>
            Map Channels
          </h2>
        </div>
        {options.isError ? (
          <p className="form-error" role="alert">
            {options.error.message}
          </p>
        ) : !options.data ? (
          <p className="readout">Loading channels… A large playlist takes a few seconds.</p>
        ) : (
          <ChannelList api={api!} providerId={props.providerId} data={options.data} />
        )}
      </div>
    </div>
  );
}

function ChannelList(props: { api: NonNullable<ReturnType<typeof useAuth>['api']>; providerId: string; data: ChannelMappingOptions }) {
  const { data } = props;
  const [text, setText] = useState('');
  const [shown, setShown] = useState(MAP_PAGE);
  const [mapped, setMapped] = useState<Record<string, Mapped>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const find = text.trim().toLowerCase();
  const rows = useMemo(
    () => (find ? data.TunerChannels.filter((c) => c.Name.toLowerCase().includes(find)) : data.TunerChannels),
    [data, find],
  );
  const sentinel = useRef<HTMLLIElement>(null);
  const more = rows.length > shown;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + MAP_PAGE);
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, shown]);

  return (
    <>
      <div className="form-field">
        <input
          type="search"
          aria-label="Find a channel"
          placeholder={`Find among ${data.TunerChannels.length} channels…`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setShown(MAP_PAGE);
          }}
          spellCheck={false}
        />
      </div>
      <p className="form-help" data-testid="channel-count">
        {rows.length} channels
      </p>
      <ul className="channel-map-list">
        {rows.slice(0, shown).map((c) => {
          const m = mapped[c.Id] ?? { name: c.ProviderChannelName, id: c.ProviderChannelId };
          return (
            <li key={c.Id} className="channel-map-row" data-testid="channel-row">
              <div className="channel-map-name">
                <p>{c.Name}</p>
                <p className="form-help">{m.name ? `${m.name} - ${data.ProviderName}` : ''}</p>
                {editing === c.Id && (
                  <GuidePicker
                    channels={data.ProviderChannels}
                    current={m.id}
                    onCancel={() => setEditing(null)}
                    onPick={async (id) => {
                      const r = await setChannelMapping(props.api, props.providerId, c.Id, id);
                      setMapped((all) => ({ ...all, [c.Id]: { name: r.ProviderChannelName, id: r.ProviderChannelId ?? id } }));
                      setEditing(null);
                    }}
                  />
                )}
              </div>
              {editing !== c.Id && (
                <button type="button" className="dash-button" onClick={() => setEditing(c.Id)} aria-label={`Map ${c.Name}`}>
                  Edit
                </button>
              )}
            </li>
          );
        })}
        {more && <li ref={sentinel} aria-hidden="true" style={{ height: 1 }} />}
      </ul>
    </>
  );
}

function GuidePicker(props: {
  channels: { Id: string; Name: string }[];
  current: string | null | undefined;
  onPick: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const pick = useMutation({ mutationFn: props.onPick });
  const find = text.trim().toLowerCase();
  const matches = useMemo(() => {
    const out: { Id: string; Name: string }[] = [];
    for (const c of props.channels) {
      if (!find || c.Name.toLowerCase().includes(find) || c.Id.toLowerCase() === find) out.push(c);
      if (out.length >= PICK_LIMIT) break;
    }
    return out.sort((a, b) => a.Name.localeCompare(b.Name));
  }, [props.channels, find]);
  const current = props.current?.toLowerCase();
  return (
    <div className="channel-map-picker" data-testid="guide-picker">
      <input
        type="search"
        aria-label="Find a guide channel"
        placeholder={`Find among ${props.channels.length} guide channels…`}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <ul className="channel-map-options">
        {matches.map((g) => (
          <li key={g.Id}>
            <button
              type="button"
              aria-current={g.Id.toLowerCase() === current}
              disabled={pick.isPending}
              onClick={() => pick.mutate(g.Id)}
            >
              {g.Name}
            </button>
          </li>
        ))}
      </ul>
      {pick.isError && (
        <p className="form-error" role="alert">
          {pick.error.message}
        </p>
      )}
      <div>
        <button type="button" className="dash-button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
