import { Link } from 'react-router-dom';
import { primaryBlurhash, primaryImageUrl } from '../api/client';
import { episodeLabel } from '../api/tv';
import { Poster } from './Poster';

type CardItem = {
  Id?: string;
  Name?: string | null;
  Type?: string | null;
  ProductionYear?: number | null;
  ImageTags?: { [key: string]: string | null } | null;
  ImageBlurHashes?: { Primary?: { [key: string]: string | null } | null } | null;
  UserData?: { PlayedPercentage?: number | null; Played?: boolean | null } | null;
  SeriesId?: string | null;
  SeriesName?: string | null;
  SeriesPrimaryImageTag?: string | null;
  ParentIndexNumber?: number | null;
  IndexNumber?: number | null;
};

/**
 * Item card shared by every shelf and grid: poster + link + user-data
 * overlays. An episode wears its series' poster and an "S1:E2" caption, so
 * Continue Watching and Next Up stay readable.
 */
export function ItemCard(props: { serverUrl: string; item: CardItem }) {
  const { serverUrl, item } = props;
  const episode = item.Type === 'Episode' && !!item.SeriesId && !!item.SeriesPrimaryImageTag;
  const imageUrl = episode
    ? primaryImageUrl(serverUrl, { Id: item.SeriesId, ImageTags: { Primary: item.SeriesPrimaryImageTag ?? null } })
    : primaryImageUrl(serverUrl, item);
  return (
    <Link to={`/item/${item.Id}`} className="card-link" data-testid="item-link">
      <Poster
        title={(item.Type === 'Episode' ? item.SeriesName : item.Name) ?? item.Name ?? 'Untitled'}
        imageUrl={imageUrl}
        blurhash={episode ? undefined : primaryBlurhash(item)}
        year={item.Type === 'Episode' ? episodeLabel(item) : item.ProductionYear}
        progress={item.UserData?.PlayedPercentage ?? 0}
        played={item.UserData?.Played ?? false}
      />
    </Link>
  );
}
