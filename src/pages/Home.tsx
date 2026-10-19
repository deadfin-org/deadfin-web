import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import type { Api } from '../api/client';
import { countLabel, fetchUserViews, libraryItemsQuery } from '../api/library';
import { fetchNextUp } from '../api/tv';
import { ItemCard } from '../components/ItemCard';
import { libraryUrl } from '../routes/paths';
import './home.css';
import './library.css';

export function Home() {
  const { session, api } = useAuth();
  if (!session || !api) return null;

  return (
    <main className="home-main" data-testid="home">
      <ResumeShelf api={api} serverUrl={session.serverUrl} userId={session.userId} />
      <NextUpShelf api={api} serverUrl={session.serverUrl} userId={session.userId} />
      <Libraries api={api} serverUrl={session.serverUrl} userId={session.userId} />
    </main>
  );
}

/** In-progress items — the first thing surfaced when any exist. */
function ResumeShelf({ api, serverUrl, userId }: { api: Api; serverUrl: string; userId: string }) {
  const items = useQuery({
    queryKey: ['resume', userId],
    queryFn: async () => {
      const { data, error } = await api.GET('/UserItems/Resume', {
        params: {
          query: {
            userId,
            limit: 12,
            enableUserData: true,
            imageTypeLimit: 1,
            enableImageTypes: ['Primary'],
          },
        },
      });
      if (error !== undefined) throw new Error('UserItems/Resume failed');
      return data?.Items ?? [];
    },
  });

  if (!items.data || items.data.length === 0) return null;
  return (
    <section className="shelf" data-testid="resume-shelf">
      <h2 className="shelf-head">
        <span className="shelf-name">Continue Watching</span>
        <span className="readout">{items.data.length} in progress</span>
      </h2>
      <div className="shelf-grid">
        {items.data.map((item) => (
          <ItemCard key={item.Id} serverUrl={serverUrl} item={item} />
        ))}
      </div>
    </section>
  );
}

/** The next episode of each series in progress. */
function NextUpShelf({ api, serverUrl, userId }: { api: Api; serverUrl: string; userId: string }) {
  const items = useQuery({
    queryKey: ['next-up', userId],
    queryFn: () => fetchNextUp(api, userId, { limit: 16 }),
  });
  if (!items.data || items.data.length === 0) return null;
  return (
    <section className="shelf" data-testid="next-up-shelf">
      <h2 className="shelf-head">
        <span className="shelf-name">Next Up</span>
      </h2>
      <div className="shelf-grid">
        {items.data.map((item) => (
          <ItemCard key={item.Id} serverUrl={serverUrl} item={item} />
        ))}
      </div>
    </section>
  );
}

function Libraries({ api, serverUrl, userId }: { api: Api; serverUrl: string; userId: string }) {
  const views = useQuery({
    queryKey: ['user-views', userId],
    queryFn: () => fetchUserViews(api, userId),
  });

  if (views.isPending) return <p className="home-status readout">Loading…</p>;
  if (views.isError)
    return (
      <p className="home-status readout" role="alert">
        The server did not answer.
      </p>
    );
  if (views.data.length === 0)
    return (
      <p className="home-status readout" data-testid="empty-views">
        No libraries. An administrator adds libraries in Dashboard → Libraries.
      </p>
    );

  return (
    <>
      {views.data.map((view, i) => (
        <Shelf
          key={view.Id ?? i}
          api={api}
          serverUrl={serverUrl}
          userId={userId}
          viewId={view.Id ?? ''}
          name={view.Name ?? 'Library'}
          collectionType={view.CollectionType ?? undefined}
          index={i}
        />
      ))}
    </>
  );
}

/** Home shelves show what was added last; the library page has everything. */
const SHELF_SIZE = 24;

function Shelf(props: {
  api: Api;
  serverUrl: string;
  userId: string;
  viewId: string;
  name: string;
  collectionType?: string;
  index: number;
}) {
  const { api, serverUrl, userId, viewId, name, collectionType, index } = props;
  const items = useQuery({
    queryKey: ['shelf', userId, viewId],
    queryFn: async () => {
      const { data, error } = await api.GET('/Items', {
        params: {
          query: libraryItemsQuery({
            userId,
            viewId,
            collectionType,
            sortBy: 'DateCreated',
            descending: true,
            played: 'all',
            startIndex: 0,
            limit: SHELF_SIZE,
          }),
        },
      });
      if (error !== undefined) throw new Error(`Items failed for view ${viewId}`);
      return { items: data?.Items ?? [], total: data?.TotalRecordCount ?? 0 };
    },
    enabled: viewId !== '',
  });

  return (
    <section className="shelf" style={{ animationDelay: `${0.08 * index}s` }} data-testid="shelf">
      <h2 className="shelf-head">
        <Link to={libraryUrl(viewId)} className="shelf-name shelf-name-link" data-testid="shelf-link">
          {name}
        </Link>
        <Link to={libraryUrl(viewId)} className="readout shelf-name-link" data-testid="shelf-count">
          {items.data ? `${countLabel(items.data.total)} · see all` : '· · ·'}
        </Link>
      </h2>
      {items.isError ? (
        <p className="home-status readout" role="alert">
          This library could not be loaded.
        </p>
      ) : (
        <div className="shelf-grid">
          {(items.data?.items ?? []).map((item) => (
            <ItemCard key={item.Id} serverUrl={serverUrl} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
