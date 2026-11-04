import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Api } from '../../api/client';
import { primaryBlurhash, primaryImageUrl } from '../../api/client';
import type { BaseItem, Page } from '../../api/library';
import { fetchAiringPrograms } from '../../api/liveTv';
import { timeRange } from '../../api/programs';
import { Poster } from '../../components/Poster';
import { itemUrl } from '../../routes/paths';
import './livetv.css';

/**
 * The programme on now per channel, for the loaded pages of the Channels
 * tab: one /LiveTv/Programs request per page, refreshed every minute.
 */
export function useAiring(ctx: { api: Api; userId: string }, pages: Page[] | undefined): Map<string, BaseItem> {
  const results = useQueries({
    queries: (pages ?? []).map((page) => {
      const ids = page.items.map((c) => c.Id ?? '').filter(Boolean);
      return {
        queryKey: ['airing', ctx.userId, ids],
        staleTime: 60_000,
        refetchInterval: 60_000,
        queryFn: () => fetchAiringPrograms(ctx.api, ctx.userId, ids),
      };
    }),
  });
  const now = Date.now();
  const byChannel = new Map<string, BaseItem>();
  for (const r of results)
    for (const p of r.data ?? []) {
      // The server's airing flag is from when it answered; drop what has ended since.
      if (p.ChannelId && p.EndDate && Date.parse(p.EndDate) > now) byChannel.set(p.ChannelId, p);
    }
  return byChannel;
}

/** A channel card: its logo and name, then what is on now and when, as jellyfin-web's channel cards. */
export function ChannelCard(props: { serverUrl: string; channel: BaseItem; program?: BaseItem }) {
  const { channel, program } = props;
  return (
    <Link to={itemUrl(channel)} className="card-link" data-testid="item-link">
      <Poster title={channel.Name ?? 'Untitled'} imageUrl={primaryImageUrl(props.serverUrl, channel)} blurhash={primaryBlurhash(channel)} />
      {program && (
        <span className="channel-now" data-testid="channel-now">
          <span className="program-meta">{program.Name}</span>
          <span className="program-meta readout">{timeRange(program)}</span>
        </span>
      )}
    </Link>
  );
}
