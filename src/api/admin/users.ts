import type { Api } from '../client';
import type { components } from '../schema';
import { check, optional } from './check';

export type UserDto = components['schemas']['UserDto'];
export type UserPolicy = components['schemas']['UserPolicy'];
export type AccessSchedule = components['schemas']['AccessSchedule'];
export type ParentalRating = components['schemas']['ParentalRating'];
export type UnratedItem = components['schemas']['UnratedItem'];
export type DynamicDayOfWeek = components['schemas']['DynamicDayOfWeek'];
export type NameIdPair = { Id: string; Name: string };

/** Tabs of the user edit page, as jellyfin-web `#/dashboard/users/:userId/:tab`. */
export const USER_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'access', label: 'Access' },
  { key: 'parentalcontrol', label: 'Parental Control' },
  { key: 'password', label: 'Password' },
] as const;
export type UserTab = (typeof USER_TABS)[number]['key'];

export async function fetchUsers(api: Api): Promise<UserDto[]> {
  const { data, error, response } = await api.GET('/Users');
  check('Reading the users', error, response);
  return data ?? [];
}

export async function fetchUser(api: Api, userId: string): Promise<UserDto> {
  const { data, error, response } = await api.GET('/Users/{userId}', { params: { path: { userId } } });
  check('Reading the user', error, response);
  return data!;
}

export async function createUser(api: Api, name: string, password: string): Promise<UserDto> {
  const { data, error, response } = await api.POST('/Users/New', { body: { Name: name, Password: password } });
  check(`Adding the user "${name}"`, error, response);
  return data!;
}

export async function deleteUser(api: Api, userId: string): Promise<void> {
  const { error, response } = await api.DELETE('/Users/{userId}', { params: { path: { userId } } });
  check('Deleting the user', error, response);
}

/** Saves the user record (name); the policy is saved separately. */
export async function updateUser(api: Api, user: UserDto): Promise<void> {
  const { error, response } = await api.POST('/Users', { params: { query: { userId: user.Id! } }, body: user });
  check('Saving the user', error, response);
}

export async function updatePolicy(api: Api, userId: string, policy: UserPolicy): Promise<void> {
  const { error, response } = await api.POST('/Users/{userId}/Policy', { params: { path: { userId } }, body: policy });
  check('Saving the user policy', error, response);
}

/** Sets a new password; `reset` clears it instead. */
export async function updatePassword(
  api: Api,
  userId: string,
  body: { CurrentPw?: string; NewPw?: string; ResetPassword?: boolean },
): Promise<void> {
  const { error, response } = await api.POST('/Users/Password', { params: { query: { userId } }, body });
  check('Saving the password', error, response);
}

/** Libraries an administrator can share (`/Library/MediaFolders`), as id and name. */
export async function fetchMediaFolders(api: Api): Promise<NameIdPair[]> {
  // The libraries as /Library/VirtualFolders lists them (ItemId is the
  // collection folder id the policy holds). Deadfin's /Library/MediaFolders
  // leaves the libraries out, so it is only the fallback.
  const virtual = await api.GET('/Library/VirtualFolders');
  check('Reading the libraries', virtual.error, virtual.response);
  const libraries = pairs((virtual.data ?? []).map((f) => ({ Id: f.ItemId, Name: f.Name })));
  if (libraries.length > 0) return libraries;
  const { data, error, response } = await api.GET('/Library/MediaFolders', { params: { query: { isHidden: false } } });
  check('Reading the libraries', error, response);
  return pairs(data?.Items);
}

/** Channels (plugin channels, not Live TV); null when the server has no channel API. */
export async function fetchChannels(api: Api, supportsMediaDeletion?: boolean): Promise<NameIdPair[] | null> {
  const { data, error, response } = await api.GET('/Channels', {
    params: { query: supportsMediaDeletion ? { supportsMediaDeletion } : {} },
  });
  const r = optional('Reading the channels', data, error, response);
  return r ? pairs(r.Items) : null;
}

/** Known devices, for device access; null when the server has no device API. */
export async function fetchDevices(api: Api): Promise<NameIdPair[] | null> {
  const { data, error, response } = await api.GET('/Devices');
  const r = optional('Reading the devices', data, error, response);
  if (!r) return null;
  return (r.Items ?? [])
    .filter((d) => d.Id)
    .map((d) => ({ Id: d.Id!, Name: [d.CustomName || d.Name, d.AppName].filter(Boolean).join(' - ') }));
}

/** Authentication or password reset providers; null when the server has no such API. */
export async function fetchProviders(api: Api, kind: 'auth' | 'reset'): Promise<NameIdPair[] | null> {
  const { data, error, response } = await api.GET(kind === 'auth' ? '/Auth/Providers' : '/Auth/PasswordResetProviders');
  const r = optional('Reading the providers', data, error, response);
  return r ? pairs(r) : null;
}

export async function fetchParentalRatings(api: Api): Promise<ParentalRating[]> {
  const { data, error, response } = await api.GET('/Localization/ParentalRatings');
  check('Reading the parental ratings', error, response);
  return data ?? [];
}

function pairs(items: { Id?: string | null; Name?: string | null }[] | null | undefined): NameIdPair[] {
  return (items ?? []).filter((i) => i.Id).map((i) => ({ Id: i.Id!, Name: i.Name ?? i.Id! }));
}

/**
 * Ratings with the same score fold into one choice ("PG-13/TV-14"), as
 * jellyfin-web's parental control tab.
 */
export function groupRatings(ratings: ParentalRating[]): ParentalRating[] {
  const out: ParentalRating[] = [];
  for (const r of ratings) {
    const last = out[out.length - 1];
    if (
      last &&
      last.RatingScore?.score === r.RatingScore?.score &&
      (last.RatingScore?.subScore ?? null) === (r.RatingScore?.subScore ?? null)
    ) {
      out[out.length - 1] = { ...last, Name: `${last.Name}/${r.Name}` };
      continue;
    }
    out.push({ ...r });
  }
  return out;
}

/** Index of the rating that matches the policy limit, or -1 for no limit. */
export function ratingIndex(ratings: ParentalRating[], policy: UserPolicy): number {
  const max = policy.MaxParentalRating;
  if (max == null) return -1;
  const exact = ratings.findIndex(
    (r) => r.RatingScore?.score === max && (r.RatingScore?.subScore ?? null) === (policy.MaxParentalSubRating ?? null),
  );
  if (exact >= 0) return exact;
  let idx = -1;
  ratings.forEach((r, i) => {
    if (r.RatingScore?.score != null && r.RatingScore.score <= max) idx = i;
  });
  return idx;
}

/** Item kinds the "Block items with no rating" list offers, in jellyfin-web order. */
export const UNRATED_ITEMS: { value: UnratedItem; label: string }[] = [
  { value: 'Book', label: 'Books' },
  { value: 'ChannelContent', label: 'Channels' },
  { value: 'LiveTvChannel', label: 'Live TV' },
  { value: 'Movie', label: 'Movies' },
  { value: 'Music', label: 'Music' },
  { value: 'Trailer', label: 'Trailers' },
  { value: 'Series', label: 'Shows' },
];

export const SCHEDULE_DAYS: { value: DynamicDayOfWeek; label: string }[] = [
  { value: 'Sunday', label: 'Sunday' },
  { value: 'Monday', label: 'Monday' },
  { value: 'Tuesday', label: 'Tuesday' },
  { value: 'Wednesday', label: 'Wednesday' },
  { value: 'Thursday', label: 'Thursday' },
  { value: 'Friday', label: 'Friday' },
  { value: 'Saturday', label: 'Saturday' },
  { value: 'Everyday', label: 'Every day' },
  { value: 'Weekday', label: 'Weekdays' },
  { value: 'Weekend', label: 'Weekends' },
];

/** An hour of day (0–24, half hours allowed) as a clock time. */
export function hourLabel(hour: number): string {
  const d = new Date(2000, 0, 1, Math.floor(hour) % 24, Math.round((hour % 1) * 60));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Last activity 3 hours ago", as the jellyfin-web user card. */
export function lastSeen(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return `Last activity ${timeAgo(now - t)}`;
}

/** A past duration in words: "less than a minute ago", "5 minutes ago", "2 days ago". */
export function timeAgo(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'less than a minute ago';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}
