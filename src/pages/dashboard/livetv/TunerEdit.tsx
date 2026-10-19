import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import {
  discoverTuners,
  fetchLiveTvOptions,
  fetchTunerHostTypes,
  filterLists,
  initialFilter,
  saveTunerHost,
  tunerTypeName,
  type GroupMode,
  type TunerHost,
} from '../../../api/liveTv';
import { useServerInfo } from '../../../api/serverInfo';
import { CheckboxField, FormSection } from '../../../ui/Form';
import { PageHeader } from '../../../ui/PageHeader';
import { NumberField, SelectField, TextField } from '../settings';
import { TunerGroups } from './TunerGroups';
import '../settings.css';
import './livetv.css';

/** The form's state: the tuner fields, the fallback bitrate in Mbps, and the group filter. */
export interface TunerForm {
  Type: string;
  FriendlyName: string;
  Url: string;
  UserAgent: string;
  DeviceId: string;
  TunerCount: number | null;
  FallbackMbps: number | null;
  ImportFavoritesOnly: boolean;
  AllowHWTranscoding: boolean;
  AllowFmp4TranscodingContainer: boolean;
  AllowStreamSharing: boolean;
  EnableStreamLooping: boolean;
  IgnoreDts: boolean;
  ReadAtNativeFramerate: boolean;
  SkipVodEntries: boolean;
  PlaylistRefreshMinutes: number | null;
  StreamOpenIntervalMs: number | null;
  groupMode: GroupMode;
  groups: string[];
}

/** The form for a stored tuner, or the defaults of jellyfin-web's tuner page for a new one. */
export function tunerForm(t: TunerHost | undefined, defaultType = ''): TunerForm {
  const filter = t ? initialFilter(t) : { mode: 'all' as const, selected: [] };
  return {
    Type: t?.Type ?? defaultType,
    FriendlyName: t?.FriendlyName ?? '',
    Url: t?.Url ?? '',
    UserAgent: t?.UserAgent ?? '',
    DeviceId: t?.DeviceId ?? '',
    TunerCount: t?.TunerCount ?? 0,
    FallbackMbps: t?.FallbackMaxStreamingBitrate ? t.FallbackMaxStreamingBitrate / 1e6 : 30,
    ImportFavoritesOnly: t?.ImportFavoritesOnly ?? false,
    AllowHWTranscoding: t?.AllowHWTranscoding ?? false,
    AllowFmp4TranscodingContainer: t?.AllowFmp4TranscodingContainer ?? false,
    AllowStreamSharing: t?.AllowStreamSharing ?? true,
    EnableStreamLooping: t?.EnableStreamLooping ?? false,
    IgnoreDts: t?.IgnoreDts ?? true,
    ReadAtNativeFramerate: t?.ReadAtNativeFramerate ?? true,
    SkipVodEntries: t?.SkipVodEntries ?? false,
    PlaylistRefreshMinutes: t?.PlaylistRefreshMinutes ?? null,
    StreamOpenIntervalMs: t?.StreamOpenIntervalMs ?? null,
    groupMode: filter.mode,
    groups: filter.selected,
  };
}

/**
 * The tuner a save sends, as jellyfin-web's livetvtuner.js builds it. On
 * Deadfin an M3U tuner also sends Deadfin's fields: empty number fields are
 * left out, so the server keeps the stored value or its default, and the
 * group lists go only with a tuner that has an id.
 */
export function tunerBody(f: TunerForm, id: string | null, deadfin: boolean): TunerHost {
  const body: TunerHost = {
    Type: f.Type,
    Url: f.Url.trim() || null,
    UserAgent: f.UserAgent.trim() || null,
    FriendlyName: f.FriendlyName.trim() || null,
    DeviceId: f.DeviceId || null,
    TunerCount: f.TunerCount ?? 0,
    FallbackMaxStreamingBitrate: Math.trunc(1e6 * (f.FallbackMbps || 30)),
    ImportFavoritesOnly: f.ImportFavoritesOnly,
    AllowHWTranscoding: f.AllowHWTranscoding,
    AllowFmp4TranscodingContainer: f.AllowFmp4TranscodingContainer,
    AllowStreamSharing: f.AllowStreamSharing,
    EnableStreamLooping: f.EnableStreamLooping,
    IgnoreDts: f.IgnoreDts,
    ReadAtNativeFramerate: f.ReadAtNativeFramerate,
  };
  if (id) body.Id = id;
  if (deadfin && f.Type === 'm3u') {
    body.SkipVodEntries = f.SkipVodEntries;
    if (f.PlaylistRefreshMinutes !== null) body.PlaylistRefreshMinutes = f.PlaylistRefreshMinutes;
    if (f.StreamOpenIntervalMs !== null) body.StreamOpenIntervalMs = f.StreamOpenIntervalMs;
    if (id) Object.assign(body, filterLists(f.groupMode, f.groups));
  }
  return body;
}

/** Dashboard → Live TV → tuner setup (`#/dashboard/livetv/tuner?id=`), as jellyfin-web livetvtuner. */
export function TunerEdit() {
  const { api, session } = useAuth();
  const [params] = useSearchParams();
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const options = useQuery({
    queryKey: ['livetv-options', session?.serverUrl],
    enabled: !!api,
    queryFn: () => fetchLiveTvOptions(api!),
  });
  const types = useQuery({
    queryKey: ['livetv-tuner-types', session?.serverUrl],
    enabled: !!api,
    queryFn: () => fetchTunerHostTypes(api!),
    staleTime: 5 * 60_000,
  });
  const { identity } = useServerInfo(api!, session!.serverUrl);
  const deadfin = identity?.product === 'Deadfin';
  const stored = id ? options.data?.TunerHosts?.find((t) => t.Id === id) : undefined;
  const [form, setForm] = useState<TunerForm | null>(null);
  useEffect(() => {
    if (form || !options.data || !types.data) return;
    setForm(tunerForm(stored, types.data[0]?.Id ?? 'other'));
  }, [form, options.data, types.data, stored]);
  const [detected, setDetected] = useState<TunerHost[] | null>(null);
  const detect = useMutation({ mutationFn: () => discoverTuners(api!), onSuccess: setDetected });
  const save = useMutation({
    mutationFn: () => saveTunerHost(api!, stored, tunerBody(form!, id, deadfin)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['livetv-options', session?.serverUrl] });
      navigate('/dashboard/livetv');
    },
  });

  if (!api || !session) return null;
  const set = (changes: Partial<TunerForm>) => {
    save.reset();
    setForm((f) => (f ? { ...f, ...changes } : f));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const loadError = options.error ?? types.error;
  const missing = id && options.data && !stored;

  return (
    <>
      <PageHeader title="Live TV Tuner Setup" />
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError.message}
        </p>
      ) : missing ? (
        <p className="form-error" role="alert">
          No tuner has this id. <Link to="/dashboard/livetv">Back to Live TV</Link>
        </p>
      ) : !form || !types.data ? (
        <p className="readout">Loading…</p>
      ) : (
        <form className="settings-form" data-testid="tuner-form" onSubmit={submit}>
          <div className="form-section">
            <SelectField
              label="Tuner type"
              value={form.Type}
              disabled={!!id}
              onChange={(v) => set({ Type: v })}
              options={[
                ...types.data.map((t) => [t.Id, t.Name] as const),
                ...(id && !types.data.some((t) => t.Id === form.Type) ? [[form.Type, tunerTypeName(form.Type)] as const] : []),
                ['other', 'Other'],
              ]}
            />
            {!id && (
              <div className="dash-row">
                <button type="button" className="dash-button" disabled={detect.isPending} onClick={() => detect.mutate()}>
                  Detect My Devices
                </button>
                {detect.isError && (
                  <span className="form-error" role="alert">
                    {detect.error.message}
                  </span>
                )}
                {detected?.length === 0 && <span className="form-help">No new devices found.</span>}
                {detected?.map((d) => (
                  <button
                    key={d.DeviceId ?? d.Url}
                    type="button"
                    className="dash-button"
                    onClick={() => setForm(tunerForm(d, d.Type ?? form.Type))}
                  >
                    {d.FriendlyName || tunerTypeName(d.Type)} {d.Url}
                  </button>
                ))}
              </div>
            )}
            {form.Type === 'other' ? (
              <p className="form-help">Pick a tuner type the server supports.</p>
            ) : (
              <TunerFields form={form} set={set} />
            )}
          </div>
          {deadfin && form.Type === 'm3u' && <DeadfinFields form={form} set={set} />}
          {deadfin && form.Type === 'm3u' && id && (
            <TunerGroups
              serverUrl={session.serverUrl}
              token={session.accessToken}
              tunerId={id}
              mode={form.groupMode}
              selected={form.groups}
              onChange={(groupMode, groups) => set({ groupMode, groups })}
            />
          )}
          {deadfin && form.Type === 'm3u' && !id && (
            <p className="form-help">Save the tuner first. Then open it again to pick its channel groups.</p>
          )}
          <div className="save-bar">
            {form.Type !== 'other' && (
              <button type="submit" className="button-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
            <Link to="/dashboard/livetv" className="dash-button">
              Cancel
            </Link>
            {save.isError && (
              <span className="form-error" role="alert">
                {save.error.message}
              </span>
            )}
          </div>
          {form.Type === 'm3u' && (
            <p className="form-help">A save downloads the playlist again and queues a guide refresh.</p>
          )}
        </form>
      )}
    </>
  );
}

function TunerFields({ form, set }: { form: TunerForm; set: (c: Partial<TunerForm>) => void }) {
  const m3u = form.Type === 'm3u';
  const hdhr = form.Type === 'hdhomerun';
  const check = (name: keyof TunerForm, label: string, help: string) => (
    <CheckboxField label={label} help={help} checked={!!form[name]} onChange={(on) => set({ [name]: on })} />
  );
  return (
    <>
      <TextField label="Friendly name" value={form.FriendlyName} onChange={(v) => set({ FriendlyName: v })} />
      {(m3u || hdhr) && (
        <TextField
          label={hdhr ? 'Tuner IP Address' : 'File or URL'}
          value={form.Url}
          required={m3u}
          onChange={(v) => set({ Url: v })}
        />
      )}
      {m3u && (
        <TextField
          label="User agent"
          value={form.UserAgent}
          onChange={(v) => set({ UserAgent: v })}
          help="Supply a custom 'User-Agent' HTTP header."
        />
      )}
      {m3u && (
        <NumberField
          label="Simultaneous stream limit"
          value={form.TunerCount}
          onChange={(v) => set({ TunerCount: v })}
          min={0}
          required
          help="The maximum number of allowed simultaneous streams. Enter 0 for no limit."
        />
      )}
      {(m3u || hdhr) && (
        <NumberField
          label="Fallback max stream bitrate (Mbps)"
          value={form.FallbackMbps}
          onChange={(v) => set({ FallbackMbps: v })}
          min={1}
          required
          help="The maximum streaming bitrate is used as a fallback when ffprobe is unable to determine the source stream bitrate. This helps prevent clients from requesting an excessively high transcoding bitrate, which could cause the player to fail and overload the encoder."
        />
      )}
      {hdhr &&
        check(
          'ImportFavoritesOnly',
          'Restrict to channels marked as favorite',
          'Only channels that are marked as favorite on the tuner device will be imported.',
        )}
      {hdhr &&
        check(
          'AllowHWTranscoding',
          'Allow hardware transcoding',
          'Allow the tuner to transcode streams on the fly. This may help reduce transcoding required by the server.',
        )}
      {m3u && (
        <>
          {check(
            'AllowFmp4TranscodingContainer',
            'Allow fMP4 transcoding container',
            'Allow fMP4 transcoding container for this tuner to enable HEVC and HDR contents. Not all tuners are compatible with this container. Disable this if you experience playback issues.',
          )}
          {check(
            'AllowStreamSharing',
            'Allow stream sharing',
            'Allow the server to duplicate the mpegts stream from tuner and share this duplicated stream to its clients. This is useful when the tuner has total stream count limit but may also cause playback issues.',
          )}
          {check(
            'EnableStreamLooping',
            'Auto-loop live streams',
            'Enable this if live streams only contain a few seconds of data and need to be continuously requested. Enabling this when not needed may cause problems.',
          )}
          {check(
            'IgnoreDts',
            'Ignore DTS (decoding timestamp)',
            'Disabling this option may resolve some issues, e.g. missing audio on channels with separate audio and video streams.',
          )}
          {check(
            'ReadAtNativeFramerate',
            'Read input at native frame rate',
            'Enabling this option may resolve some issues, e.g. live streams stopping prematurely.',
          )}
        </>
      )}
      {hdhr && <p className="form-help">Channels with DRM will not be imported.</p>}
    </>
  );
}

/** Deadfin-only M3U fields (D-78, D-93). Stock jellyfin-web does not show them. */
function DeadfinFields({ form, set }: { form: TunerForm; set: (c: Partial<TunerForm>) => void }) {
  return (
    <FormSection title="Playlist (Deadfin)">
      <CheckboxField
        label="Skip VOD entries"
        checked={form.SkipVodEntries}
        onChange={(on) => set({ SkipVodEntries: on })}
        help="Do not import the movie and series entries of an Xtream-style playlist as channels."
      />
      <NumberField
        label="Playlist refresh interval (minutes)"
        value={form.PlaylistRefreshMinutes}
        onChange={(v) => set({ PlaylistRefreshMinutes: v })}
        min={15}
        placeholder="15"
        help="The shortest time between two playlist downloads. The server never downloads more often than every 15 minutes."
      />
      <NumberField
        label="Stream open interval (ms)"
        value={form.StreamOpenIntervalMs}
        onChange={(v) => set({ StreamOpenIntervalMs: v })}
        min={0}
        placeholder="1000"
        help="The shortest time between two connections to this tuner's source, for first opens and reconnects. Empty uses 1000 ms; 0 turns the wait off. IPTV providers can ban accounts that open many streams in a short time."
      />
    </FormSection>
  );
}
