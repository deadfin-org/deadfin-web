import type { Api } from '../client';
import type { components } from '../schema';
import { check } from './check';

export type VirtualFolder = components['schemas']['VirtualFolderInfo'];
export type LibraryOptions = components['schemas']['LibraryOptions'];
export type AvailableOptions = components['schemas']['LibraryOptionsResultDto'];
export type PluginInfo = components['schemas']['LibraryOptionInfoDto'];
export type TypeOptions = components['schemas']['TypeOptions'];

/** Content types for a new library, in jellyfin-web order and words. */
export const COLLECTION_TYPES: { value: string; label: string }[] = [
  { value: 'movies', label: 'Movies' },
  { value: 'music', label: 'Music' },
  { value: 'tvshows', label: 'Shows' },
  { value: 'books', label: 'Books' },
  { value: 'homevideos', label: 'Home Videos and Photos' },
  { value: 'musicvideos', label: 'Music Videos' },
  { value: 'mixed', label: 'Mixed Movies and Shows' },
];

export function collectionTypeLabel(type: string | null | undefined): string {
  return COLLECTION_TYPES.find((t) => t.value === (type || 'mixed'))?.label ?? 'Other';
}

/** The options a new library starts with; the server fills in the rest. */
export function defaultLibraryOptions(): LibraryOptions {
  return {
    Enabled: true,
    EnablePhotos: true,
    EnableRealtimeMonitor: true,
    EnableLUFSScan: true,
    EnableChapterImageExtraction: false,
    ExtractChapterImagesDuringLibraryScan: false,
    EnableTrickplayImageExtraction: false,
    ExtractTrickplayImagesDuringLibraryScan: false,
    SaveTrickplayWithMedia: false,
    SaveLocalMetadata: false,
    EnableInternetProviders: true,
    EnableAutomaticSeriesGrouping: false,
    EnableEmbeddedTitles: false,
    EnableEmbeddedExtrasTitles: false,
    EnableEmbeddedEpisodeInfos: false,
    AutomaticRefreshIntervalDays: 0,
    PreferredMetadataLanguage: '',
    MetadataCountryCode: '',
    SeasonZeroDisplayName: 'Specials',
    AllowEmbeddedSubtitles: 'AllowAll',
    SkipSubtitlesIfEmbeddedSubtitlesPresent: false,
    SkipSubtitlesIfAudioTrackMatches: false,
    RequirePerfectSubtitleMatch: true,
    SaveSubtitlesWithMedia: true,
    SaveLyricsWithMedia: false,
    AutomaticallyAddToCollection: false,
    PreferNonstandardArtistsTag: false,
    UseCustomTagDelimiters: false,
    CustomTagDelimiters: ['/', '|', ';', '\\'],
    DelimiterWhitelist: [],
    SubtitleDownloadLanguages: [],
    TypeOptions: [],
  };
}

export async function fetchVirtualFolders(api: Api): Promise<VirtualFolder[]> {
  const { data, error, response } = await api.GET('/Library/VirtualFolders');
  check('Reading the libraries', error, response);
  return data ?? [];
}

export async function fetchAvailableOptions(api: Api, contentType: string, isNewLibrary: boolean): Promise<AvailableOptions> {
  const { data, error, response } = await api.GET('/Libraries/AvailableOptions', {
    params: {
      query: {
        // Mixed libraries have no collection type.
        ...(contentType && contentType !== 'mixed' ? { libraryContentType: contentType as never } : {}),
        isNewLibrary,
      },
    },
  });
  check('Reading the library options', error, response);
  return data!;
}

export async function fetchCultures(api: Api) {
  const { data, error, response } = await api.GET('/Localization/Cultures');
  check('Reading the languages', error, response);
  return (data ?? []).filter((c) => c.TwoLetterISOLanguageName).sort((a, b) => (a.DisplayName ?? '').localeCompare(b.DisplayName ?? ''));
}

export async function fetchCountries(api: Api) {
  const { data, error, response } = await api.GET('/Localization/Countries');
  check('Reading the countries', error, response);
  return (data ?? []).filter((c) => c.TwoLetterISORegionName).sort((a, b) => (a.DisplayName ?? '').localeCompare(b.DisplayName ?? ''));
}

export async function addVirtualFolder(
  api: Api,
  lib: { name: string; type: string; paths: string[]; options: LibraryOptions },
): Promise<void> {
  const { error, response } = await api.POST('/Library/VirtualFolders', {
    params: {
      query: {
        name: lib.name,
        ...(lib.type !== 'mixed' ? { collectionType: lib.type as never } : {}),
        refreshLibrary: true,
      },
    },
    body: { LibraryOptions: { ...lib.options, PathInfos: lib.paths.map((Path) => ({ Path })) } },
  });
  check(`Adding the library "${lib.name}"`, error, response);
}

export async function renameVirtualFolder(api: Api, name: string, newName: string): Promise<void> {
  const { error, response } = await api.POST('/Library/VirtualFolders/Name', {
    params: { query: { name, newName, refreshLibrary: true } },
  });
  check('Renaming the library', error, response);
}

export async function removeVirtualFolder(api: Api, name: string): Promise<void> {
  const { error, response } = await api.DELETE('/Library/VirtualFolders', {
    params: { query: { name, refreshLibrary: true } },
  });
  check('Removing the library', error, response);
}

export async function addMediaPath(api: Api, name: string, path: string): Promise<void> {
  const { error, response } = await api.POST('/Library/VirtualFolders/Paths', {
    params: { query: { refreshLibrary: true } },
    body: { Name: name, Path: path },
  });
  check('Adding the folder', error, response);
}

export async function removeMediaPath(api: Api, name: string, path: string): Promise<void> {
  const { error, response } = await api.DELETE('/Library/VirtualFolders/Paths', {
    params: { query: { name, path, refreshLibrary: true } },
  });
  check('Removing the folder', error, response);
}

export async function updateLibraryOptions(api: Api, id: string, options: LibraryOptions): Promise<void> {
  const { error, response } = await api.POST('/Library/VirtualFolders/LibraryOptions', {
    body: { Id: id, LibraryOptions: options },
  });
  check('Saving the library', error, response);
}

export type RefreshMode = 'scan' | 'missing' | 'all';

/**
 * Scans one library, as jellyfin-web's refresh dialog: scan for new and
 * updated files, search for missing metadata, or replace all metadata.
 */
export async function refreshLibrary(api: Api, itemId: string, mode: RefreshMode, replaceImages: boolean): Promise<void> {
  const full = mode !== 'scan';
  const { error, response } = await api.POST('/Items/{itemId}/Refresh', {
    params: {
      path: { itemId },
      query: {
        metadataRefreshMode: full ? 'FullRefresh' : 'Default',
        imageRefreshMode: full ? 'FullRefresh' : 'Default',
        replaceAllMetadata: mode === 'all',
        replaceAllImages: full && replaceImages,
      },
    },
  });
  check('Scanning the library', error, response);
}

/** Uploads a library's primary image; the body is the base64 file, as jellyfin-web sends it. */
export async function uploadPrimaryImage(api: Api, itemId: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { error, response } = await api.POST('/Items/{itemId}/Images/{imageType}', {
    params: { path: { itemId, imageType: 'Primary' } },
    body: btoa(bin) as never,
    bodySerializer: (b: unknown) => b as string,
    headers: { 'Content-Type': file.type || 'image/jpeg' },
  });
  check('Uploading the image', error, response);
}

export async function deletePrimaryImage(api: Api, itemId: string): Promise<void> {
  const { error, response } = await api.DELETE('/Items/{itemId}/Images/{imageType}', {
    params: { path: { itemId, imageType: 'Primary' } },
  });
  check('Deleting the image', error, response);
}

export function libraryImageUrl(serverUrl: string, folder: VirtualFolder, width = 480): string {
  if (!folder.ItemId || !folder.PrimaryImageItemId) return '';
  const q = new URLSearchParams({ fillWidth: String(width), quality: '90' });
  return `${serverUrl}/Items/${folder.PrimaryImageItemId}/Images/Primary?${q}`;
}

/** Plugins in the saved order first, then the rest in server order. */
export function orderedPlugins(plugins: PluginInfo[] | undefined, order: string[] | null | undefined): PluginInfo[] {
  const list = [...(plugins ?? [])];
  const rank = (p: PluginInfo) => {
    const i = (order ?? []).indexOf(p.Name ?? '');
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return list.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/** Enabled plugin names: the saved list, or the server defaults when none is saved. */
export function enabledPlugins(plugins: PluginInfo[], saved: string[] | null | undefined): string[] {
  if (saved) return saved;
  return plugins.filter((p) => p.DefaultEnabled).map((p) => p.Name ?? '');
}

/** Moves one entry of a list up (-1) or down (+1). */
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** The per-type options for one item type, created when missing. */
export function typeOptionsFor(options: LibraryOptions, type: string): TypeOptions {
  return options.TypeOptions?.find((t) => t.Type === type) ?? { Type: type };
}

export function withTypeOptions(options: LibraryOptions, type: string, patch: Partial<TypeOptions>): LibraryOptions {
  const list = options.TypeOptions ?? [];
  const found = list.some((t) => t.Type === type);
  return {
    ...options,
    TypeOptions: found ? list.map((t) => (t.Type === type ? { ...t, ...patch } : t)) : [...list, { Type: type, ...patch }],
  };
}
