import type { Api } from './client';
import type { BaseItem } from './library';
import { videoUrl } from '../routes/paths';

const CARD = {
  enableUserData: true,
  imageTypeLimit: 1,
  enableImageTypes: ['Primary' as const],
};

/** "S1:E2", "Special", or '' when the item carries no numbers. */
export function episodeLabel(item: Pick<BaseItem, 'ParentIndexNumber' | 'IndexNumber'>): string {
  const s = item.ParentIndexNumber;
  const e = item.IndexNumber;
  if (s === 0) return 'Special';
  if (typeof s === 'number' && typeof e === 'number') return `S${s}:E${e}`;
  if (typeof e === 'number') return `E${e}`;
  return '';
}

export async function fetchSeasons(api: Api, userId: string, seriesId: string): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Shows/{seriesId}/Seasons', {
    params: { path: { seriesId }, query: { userId, ...CARD } },
  });
  if (error !== undefined) throw new Error('Seasons failed');
  return data?.Items ?? [];
}

export async function fetchEpisodes(
  api: Api,
  userId: string,
  seriesId: string,
  seasonId: string,
): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Shows/{seriesId}/Episodes', {
    params: { path: { seriesId }, query: { userId, seasonId, ...CARD } },
  });
  if (error !== undefined) throw new Error('Episodes failed');
  return data?.Items ?? [];
}

/** Next Up across all series, or for one series. */
export async function fetchNextUp(
  api: Api,
  userId: string,
  opts: { seriesId?: string; limit?: number } = {},
): Promise<BaseItem[]> {
  const { data, error } = await api.GET('/Shows/NextUp', {
    params: { query: { userId, seriesId: opts.seriesId, limit: opts.limit ?? 16, ...CARD } },
  });
  if (error !== undefined) throw new Error('NextUp failed');
  return data?.Items ?? [];
}

/** The episode after `episodeId` in its series, in the server's order. */
export async function fetchNextEpisode(
  api: Api,
  userId: string,
  seriesId: string,
  episodeId: string,
): Promise<BaseItem | undefined> {
  const { data, error } = await api.GET('/Shows/{seriesId}/Episodes', {
    params: { path: { seriesId }, query: { userId, startItemId: episodeId, limit: 2, ...CARD } },
  });
  if (error !== undefined) throw new Error('Episodes failed');
  const items = data?.Items ?? [];
  return items[0]?.Id === episodeId ? items[1] : undefined;
}

/**
 * Which season to open: the one asked for, else the first regular season
 * with something unplayed, else the first regular season, else the first.
 */
export function pickSeason(seasons: BaseItem[], requested?: string | null): BaseItem | undefined {
  if (requested) {
    const hit = seasons.find((s) => s.Id === requested);
    if (hit) return hit;
  }
  const regular = seasons.filter((s) => s.IndexNumber !== 0);
  return (
    regular.find((s) => (s.UserData?.UnplayedItemCount ?? 1) > 0) ?? regular[0] ?? seasons[0]
  );
}

/** The "Play" target for a series: its Next Up, else the first unplayed episode, else the first. */
export function playNextTarget(nextUp: BaseItem | undefined, episodes: BaseItem[]): BaseItem | undefined {
  return nextUp ?? episodes.find((e) => !e.UserData?.Played) ?? episodes[0];
}

/** Play URL for an episode or video, resuming where it was left. */
export function playUrl(item: BaseItem): string {
  return videoUrl(item.Id ?? '', item.UserData?.Played ? 0 : item.UserData?.PlaybackPositionTicks);
}
