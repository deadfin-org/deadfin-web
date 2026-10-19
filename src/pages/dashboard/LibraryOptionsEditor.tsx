import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import {
  enabledPlugins,
  fetchCountries,
  fetchCultures,
  move,
  orderedPlugins,
  typeOptionsFor,
  withTypeOptions,
  type AvailableOptions,
  type LibraryOptions,
  type PluginInfo,
} from '../../api/admin/libraries';
import { CheckboxField, Field, FormSection } from '../../ui/Form';

type BoolKey = { [K in keyof LibraryOptions]-?: LibraryOptions[K] extends boolean | undefined ? K : never }[keyof LibraryOptions];

/** Plural item type names for per-type plugin lists, as jellyfin-web `TypeOptionPlural*`. */
const TYPE_PLURALS: Record<string, string> = {
  Movie: 'Movies',
  Series: 'TV Shows',
  Season: 'Seasons',
  Episode: 'Episodes',
  MusicAlbum: 'Albums',
  MusicArtist: 'Artists',
  Audio: 'Songs',
  MusicVideo: 'Music Videos',
  Book: 'Books',
  AudioBook: 'Audiobooks',
  BoxSet: 'Collections',
  Video: 'Videos',
  Photo: 'Photos',
  PhotoAlbum: 'Photo Albums',
  Trailer: 'Trailers',
};

const CHAPTER_TYPES = ['homevideos', 'movies', 'musicvideos', 'tvshows', 'mixed'];

/**
 * Plugins with a checkbox each (optional) and up/down buttons (optional),
 * as jellyfin-web's sortable checkbox lists.
 */
export function PluginList(props: {
  title: string;
  help: string;
  plugins: PluginInfo[];
  enabled?: string[];
  onEnabled?: (names: string[]) => void;
  onOrder?: (names: string[]) => void;
  testId?: string;
}) {
  const names = props.plugins.map((p) => p.Name ?? '');
  if (!names.length) return null;
  return (
    <fieldset className="plugin-list" data-testid={props.testId}>
      <legend>{props.title}</legend>
      <ul>
        {names.map((n, i) => (
          <li key={n}>
            {props.enabled && props.onEnabled ? (
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={props.enabled.includes(n)}
                  onChange={(e) =>
                    props.onEnabled!(e.target.checked ? [...props.enabled!, n] : props.enabled!.filter((x) => x !== n))
                  }
                />
                {n}
              </label>
            ) : (
              <span>{n}</span>
            )}
            {props.onOrder && names.length > 1 && (
              <span className="plugin-order">
                <button type="button" aria-label={`Move ${n} up`} title="Up" disabled={i === 0} onClick={() => props.onOrder!(move(names, i, -1))}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${n} down`}
                  title="Down"
                  disabled={i === names.length - 1}
                  onClick={() => props.onOrder!(move(names, i, 1))}
                >
                  ▼
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="form-help">{props.help}</p>
    </fieldset>
  );
}

/**
 * Every library option jellyfin-web 12.0 shows for a content type, with the
 * plugin lists from /Libraries/AvailableOptions.
 */
export function LibraryOptionsEditor(props: {
  contentType: string;
  options: LibraryOptions;
  available: AvailableOptions | undefined;
  onChange: (o: LibraryOptions) => void;
}) {
  const { api } = useAuth();
  const { contentType: type, options: o, available: a, onChange } = props;
  const cultures = useQuery({ queryKey: ['admin', 'cultures'], queryFn: () => fetchCultures(api!), staleTime: Infinity });
  const countries = useQuery({ queryKey: ['admin', 'countries'], queryFn: () => fetchCountries(api!), staleTime: Infinity });
  const set = (patch: Partial<LibraryOptions>) => onChange({ ...o, ...patch });
  const check = (key: BoolKey, label: string) => <CheckboxField label={label} checked={!!o[key]} onChange={(v) => set({ [key]: v })} />;

  const typeOpts = a?.TypeOptions ?? [];
  const hasFetchers = typeOpts.some((t) => t.MetadataFetchers?.length);
  const hasImageFetchers = typeOpts.some((t) => t.ImageFetchers?.length);
  const embeddedTitles = !['books', 'boxsets', 'playlists', 'music'].includes(type);
  const chapters = CHAPTER_TYPES.includes(type);
  const plural = (t: string | null | undefined) => TYPE_PLURALS[t ?? ''] ?? t ?? '';

  const disabledList = (
    plugins: PluginInfo[] | undefined,
    disabledKey: 'DisabledSubtitleFetchers' | 'DisabledLyricFetchers' | 'DisabledMediaSegmentProviders',
    orderKey: 'SubtitleFetcherOrder' | 'LyricFetcherOrder' | 'MediaSegmentProviderOrder',
  ) => {
    const list = orderedPlugins(plugins, o[orderKey]);
    const disabled = o[disabledKey] ?? [];
    return {
      plugins: list,
      enabled: list.map((p) => p.Name ?? '').filter((n) => !disabled.includes(n)),
      onEnabled: (names: string[]) =>
        set({ [disabledKey]: list.map((p) => p.Name ?? '').filter((n) => !names.includes(n)) } as Partial<LibraryOptions>),
      onOrder: (names: string[]) => set({ [orderKey]: names } as Partial<LibraryOptions>),
    };
  };

  return (
    <div className="library-options" data-testid="library-options">
      <FormSection title="Library Settings">
        {check('Enabled', 'Enable the library')}
        {hasFetchers && (
          <Field label="Preferred download language">
            {(id) => (
              <select id={id} value={o.PreferredMetadataLanguage ?? ''} onChange={(e) => set({ PreferredMetadataLanguage: e.target.value })}>
                <option value=""></option>
                {(cultures.data ?? []).map((c) => (
                  <option key={c.TwoLetterISOLanguageName} value={c.TwoLetterISOLanguageName ?? ''}>
                    {c.DisplayName}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {hasFetchers && (
          <Field label="Country/Region">
            {(id) => (
              <select id={id} value={o.MetadataCountryCode ?? ''} onChange={(e) => set({ MetadataCountryCode: e.target.value })}>
                <option value=""></option>
                {(countries.data ?? []).map((c) => (
                  <option key={c.TwoLetterISORegionName} value={c.TwoLetterISORegionName ?? ''}>
                    {c.DisplayName}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {(type === 'homevideos' || type === 'photos') && check('EnablePhotos', 'Display the photos')}
        {type === 'tvshows' && (
          <Field label="Special season display name">
            {(id) => (
              <input id={id} value={o.SeasonZeroDisplayName ?? 'Specials'} onChange={(e) => set({ SeasonZeroDisplayName: e.target.value })} />
            )}
          </Field>
        )}
        {embeddedTitles && check('EnableEmbeddedTitles', 'Prefer embedded titles over filenames')}
        {embeddedTitles && o.EnableEmbeddedTitles && check('EnableEmbeddedExtrasTitles', 'Prefer embedded titles over filenames for extras')}
        {type === 'tvshows' && check('EnableEmbeddedEpisodeInfos', 'Prefer embedded episode information over filenames')}
        {['tvshows', 'movies', 'musicvideos', 'mixed'].includes(type) && (
          <Field label="Disable different types of embedded subtitles">
            {(id) => (
              <select
                id={id}
                value={o.AllowEmbeddedSubtitles ?? 'AllowAll'}
                onChange={(e) => set({ AllowEmbeddedSubtitles: e.target.value as LibraryOptions['AllowEmbeddedSubtitles'] })}
              >
                <option value="AllowAll">Allow All</option>
                <option value="AllowText">Allow Text</option>
                <option value="AllowImage">Allow Image</option>
                <option value="AllowNone">Allow None</option>
              </select>
            )}
          </Field>
        )}
        {check('EnableRealtimeMonitor', 'Enable real time monitoring')}
        {type === 'music' && check('EnableLUFSScan', 'Enable LUFS scan')}
        {(type === 'movies' || type === 'mixed') && check('AutomaticallyAddToCollection', 'Automatically add to collection')}
        {(a?.MetadataReaders?.length ?? 0) > 1 && (
          <PluginList
            title="Metadata readers"
            help="Rank your preferred local metadata sources in order of priority. The first file found will be read."
            plugins={orderedPlugins(a?.MetadataReaders, o.LocalMetadataReaderOrder)}
            onOrder={(names) => set({ LocalMetadataReaderOrder: names })}
          />
        )}
        {typeOpts.map((t) => {
          const mine = typeOptionsFor(o, t.Type ?? '');
          const plugins = orderedPlugins(t.MetadataFetchers, mine.MetadataFetcherOrder);
          return (
            <PluginList
              key={`meta-${t.Type}`}
              testId={`metadata-fetchers-${t.Type}`}
              title={`Metadata downloaders (${plural(t.Type)})`}
              help="Enable and rank your preferred metadata downloaders in order of priority. Lower priority downloaders will only be used to fill in missing information."
              plugins={plugins}
              enabled={enabledPlugins(plugins, mine.MetadataFetchers)}
              onEnabled={(names) => onChange(withTypeOptions(o, t.Type ?? '', { MetadataFetchers: names, MetadataFetcherOrder: plugins.map((p) => p.Name ?? '') }))}
              onOrder={(names) =>
                onChange(
                  withTypeOptions(o, t.Type ?? '', {
                    MetadataFetcherOrder: names,
                    MetadataFetchers: enabledPlugins(plugins, mine.MetadataFetchers),
                  }),
                )
              }
            />
          );
        })}
        {hasFetchers && (
          <Field label="Automatically refresh metadata from the internet">
            {(id) => (
              <select id={id} value={o.AutomaticRefreshIntervalDays ?? 0} onChange={(e) => set({ AutomaticRefreshIntervalDays: Number(e.target.value) })}>
                <option value={0}>Never</option>
                {[30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    Every {d} days
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {!!a?.MetadataSavers?.length && (
          <PluginList
            title="Metadata savers"
            help="Pick the file formats to use when saving your metadata."
            plugins={a.MetadataSavers}
            enabled={enabledPlugins(a.MetadataSavers, o.MetadataSavers)}
            onEnabled={(names) => set({ MetadataSavers: names })}
          />
        )}
        {typeOpts.map((t) => {
          const mine = typeOptionsFor(o, t.Type ?? '');
          const plugins = orderedPlugins(t.ImageFetchers, mine.ImageFetcherOrder);
          return (
            <PluginList
              key={`img-${t.Type}`}
              title={`Image fetchers (${plural(t.Type)})`}
              help="Enable and rank your preferred image fetchers in order of priority."
              plugins={plugins}
              enabled={enabledPlugins(plugins, mine.ImageFetchers)}
              onEnabled={(names) => onChange(withTypeOptions(o, t.Type ?? '', { ImageFetchers: names, ImageFetcherOrder: plugins.map((p) => p.Name ?? '') }))}
              onOrder={(names) =>
                onChange(
                  withTypeOptions(o, t.Type ?? '', { ImageFetcherOrder: names, ImageFetchers: enabledPlugins(plugins, mine.ImageFetchers) }),
                )
              }
            />
          );
        })}
        {typeOpts.map((t) => {
          const mine = typeOptionsFor(o, t.Type ?? '');
          const plugins = orderedPlugins(t.SimilarItemProviders, mine.SimilarItemProviderOrder);
          return (
            <PluginList
              key={`sim-${t.Type}`}
              title={`Similar item providers (${plural(t.Type)})`}
              help="Enable and rank your preferred similar item providers in order of priority."
              plugins={plugins}
              enabled={enabledPlugins(plugins, mine.SimilarItemProviders)}
              onEnabled={(names) =>
                onChange(withTypeOptions(o, t.Type ?? '', { SimilarItemProviders: names, SimilarItemProviderOrder: plugins.map((p) => p.Name ?? '') }))
              }
              onOrder={(names) =>
                onChange(
                  withTypeOptions(o, t.Type ?? '', {
                    SimilarItemProviderOrder: names,
                    SimilarItemProviders: enabledPlugins(plugins, mine.SimilarItemProviders),
                  }),
                )
              }
            />
          );
        })}
        {hasImageFetchers && check('SaveLocalMetadata', 'Save artwork into media folders')}
        {type === 'tvshows' && check('EnableAutomaticSeriesGrouping', 'Automatically merge series that are spread across multiple folders')}
        <PluginList
          title="Media segment providers"
          help="Enable and rank your preferred media segment providers in order of priority."
          {...disabledList(a?.MediaSegmentProviders, 'DisabledMediaSegmentProviders', 'MediaSegmentProviderOrder')}
        />
      </FormSection>
      {chapters && (
        <FormSection title="Trickplay">
          {check('EnableTrickplayImageExtraction', 'Enable trickplay image extraction')}
          {check('ExtractTrickplayImagesDuringLibraryScan', 'Extract trickplay images during the library scan')}
          {check('SaveTrickplayWithMedia', 'Save trickplay images next to media')}
        </FormSection>
      )}
      {chapters && (
        <FormSection title="Chapter Images">
          {check('EnableChapterImageExtraction', 'Enable chapter image extraction')}
          {check('ExtractChapterImagesDuringLibraryScan', 'Extract chapter images during the library scan')}
        </FormSection>
      )}
      {!!a?.SubtitleFetchers?.length && (
        <FormSection title="Subtitle Downloads">
          <fieldset className="check-list check-list-scroll">
            <legend>Download languages</legend>
            {(cultures.data ?? []).map((c) => {
              const code = c.ThreeLetterISOLanguageName ?? '';
              const langs = o.SubtitleDownloadLanguages ?? [];
              return (
                <CheckboxField
                  key={code}
                  label={c.DisplayName ?? code}
                  checked={langs.includes(code)}
                  onChange={(on) => set({ SubtitleDownloadLanguages: on ? [...langs, code] : langs.filter((l) => l !== code) })}
                />
              );
            })}
          </fieldset>
          <PluginList
            title="Subtitle downloaders"
            help="Enable and rank your preferred subtitle downloaders in order of priority."
            {...disabledList(a.SubtitleFetchers, 'DisabledSubtitleFetchers', 'SubtitleFetcherOrder')}
          />
          {check('RequirePerfectSubtitleMatch', 'Only download subtitles that are a perfect match for video files')}
          {check('SkipSubtitlesIfAudioTrackMatches', 'Skip if the default audio track matches the download language')}
          {check('SkipSubtitlesIfEmbeddedSubtitlesPresent', 'Skip if the video already contains embedded subtitles')}
          {check('SaveSubtitlesWithMedia', 'Save subtitles into media folders')}
        </FormSection>
      )}
      {type === 'music' && (
        <FormSection title="Lyrics">
          {check('SaveLyricsWithMedia', 'Save lyrics into media folders')}
          <PluginList
            title="Lyric downloaders"
            help="Enable and rank your preferred lyric downloaders in order of priority."
            {...disabledList(a?.LyricFetchers, 'DisabledLyricFetchers', 'LyricFetcherOrder')}
          />
        </FormSection>
      )}
      {type === 'music' && (
        <FormSection title="Audio Tag settings">
          {check('PreferNonstandardArtistsTag', 'Prefer ARTISTS tag if available')}
          {check('UseCustomTagDelimiters', 'Use custom tag delimiter')}
          <Field label="Custom Tag Delimiter">
            {(id) => (
              <input
                id={id}
                value={(o.CustomTagDelimiters ?? []).join('')}
                onChange={(e) => set({ CustomTagDelimiters: e.target.value.split('') })}
              />
            )}
          </Field>
          <Field label="Delimiter Whitelist">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                value={(o.DelimiterWhitelist ?? []).join('\n')}
                onChange={(e) => set({ DelimiterWhitelist: e.target.value.split('\n') })}
              />
            )}
          </Field>
        </FormSection>
      )}
    </div>
  );
}
