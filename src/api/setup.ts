import type { Api } from './client';
import type { components } from './schema';

export type CollectionType = components['schemas']['CollectionTypeOptions'];

/** Library kinds offered when adding a library, in the order shown. */
export const LIBRARY_KINDS: { value: CollectionType; label: string }[] = [
  { value: 'movies', label: 'Movies' },
  { value: 'tvshows', label: 'Shows' },
  { value: 'music', label: 'Music' },
  { value: 'homevideos', label: 'Home videos and photos' },
  { value: 'musicvideos', label: 'Music videos' },
  { value: 'books', label: 'Books' },
];

/** Thrown for a 403 from Deadfin's first-run gate (D-53). */
export class SetupGateError extends Error {
  constructor() {
    super(
      'Setup is open only to browsers on the same local network as the server. ' +
        'Open the setup link from the server log (…/deadfin/v1/setup?token=…) in this browser, then reload.',
    );
  }
}

function check(step: string, error: unknown, response: Response): void {
  if (error === undefined && response.ok) return;
  if (response.status === 403) throw new SetupGateError();
  throw new Error(`${step} failed (HTTP ${response.status}).`);
}

/** Whether the server at this address still needs its first-run setup; null when unreachable. */
export async function needsSetup(api: Api): Promise<boolean | null> {
  try {
    const { data, error } = await api.GET('/System/Info/Public');
    if (error !== undefined || !data) return null;
    return data.StartupWizardCompleted === false;
  } catch {
    return null;
  }
}

export interface ServerSettings {
  ServerName: string;
  PreferredMetadataLanguage: string;
  MetadataCountryCode: string;
}

export async function loadStartup(api: Api): Promise<{ settings: ServerSettings; adminName: string }> {
  const conf = await api.GET('/Startup/Configuration');
  check('Reading the server settings', conf.error, conf.response);
  const user = await api.GET('/Startup/User');
  check('Reading the first user', user.error, user.response);
  return {
    settings: {
      ServerName: conf.data?.ServerName ?? '',
      PreferredMetadataLanguage: conf.data?.PreferredMetadataLanguage || 'en',
      MetadataCountryCode: conf.data?.MetadataCountryCode || 'US',
    },
    adminName: user.data?.Name ?? '',
  };
}

export async function saveSettings(api: Api, s: ServerSettings): Promise<void> {
  const { error, response } = await api.POST('/Startup/Configuration', {
    body: { ...s, UICulture: navigator.language || 'en-US' },
  });
  check('Saving the server settings', error, response);
}

export async function saveAdmin(api: Api, name: string, password: string): Promise<void> {
  const { error, response } = await api.POST('/Startup/User', { body: { Name: name, Password: password } });
  check('Creating the administrator', error, response);
}

export async function saveRemoteAccess(api: Api, enable: boolean): Promise<void> {
  const { error, response } = await api.POST('/Startup/RemoteAccess', { body: { EnableRemoteAccess: enable } });
  check('Saving remote access', error, response);
}

export async function completeSetup(api: Api): Promise<void> {
  const { error, response } = await api.POST('/Startup/Complete');
  check('Finishing setup', error, response);
}

export interface NewLibrary {
  name: string;
  type: CollectionType;
  paths: string[];
}

/** Adds a library and starts its scan. Works during setup and for an admin later. */
export async function addLibrary(api: Api, lib: NewLibrary): Promise<void> {
  const { error, response } = await api.POST('/Library/VirtualFolders', {
    params: { query: { name: lib.name, collectionType: lib.type, paths: lib.paths, refreshLibrary: true } },
    // The paths travel in the query; the contract marks these four options
    // required, and false is the server default for each.
    body: {
      LibraryOptions: {
        Enabled: true,
        SaveLyricsWithMedia: false,
        SaveTrickplayWithMedia: false,
        PreferNonstandardArtistsTag: false,
        UseCustomTagDelimiters: false,
      },
    },
  });
  check(`Adding the library "${lib.name}"`, error, response);
}

export interface Folder {
  name: string;
  path: string;
}

/** Subfolders of a server path, for the folder picker. */
export async function listFolders(api: Api, path: string): Promise<Folder[]> {
  const { data, error, response } = await api.GET('/Environment/DirectoryContents', {
    params: { query: { path, includeDirectories: true, includeFiles: false } },
  });
  check('Listing folders', error, response);
  return (data ?? [])
    .filter((e) => e.Path)
    .map((e) => ({ name: e.Name ?? e.Path!, path: e.Path! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The parent of a server path: '/media/movies' → '/media' → '/'; 'C:\\Media' → 'C:\\'. */
export function parentPath(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (cut < 0) return /^[A-Za-z]:$/.test(p) ? `${p}\\` : '/';
  if (cut === 0) return '/';
  const parent = p.slice(0, cut);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}
