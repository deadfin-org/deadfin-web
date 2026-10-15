import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { primaryBlurhash, primaryImageUrl, type Api } from '../api/client';
import { describeWebBuild, webBuild } from '../build';
import { Poster } from '../components/Poster';
import { SharkMark } from '../components/SharkMark';
import './home.css';

export function Home() {
  const { session, api, signOut } = useAuth();
  if (!session || !api) return null;

  return (
    <div className="home">
      <header className="home-bar">
        <div className="home-ident">
          <SharkMark size={34} />
          <span className="home-word">DEADFIN</span>
        </div>
        <ConnectionReadout api={api} serverUrl={session.serverUrl} />
        <WebBuildReadout />
        <div className="home-operator">
          <span className="readout">{session.userName}</span>
          <button className="home-signout readout" onClick={signOut}>
            surface ↑
          </button>
        </div>
      </header>

      <main className="home-main">
        <ResumeShelf api={api} serverUrl={session.serverUrl} userId={session.userId} />
        <Libraries api={api} serverUrl={session.serverUrl} userId={session.userId} />
      </main>
    </div>
  );
}

function ConnectionReadout({ api, serverUrl }: { api: Api; serverUrl: string }) {
  const info = useQuery({
    queryKey: ['system-info', serverUrl],
    queryFn: async () => {
      const { data, error } = await api.GET('/System/Info/Public');
      if (error !== undefined) throw new Error('System/Info/Public failed');
      return data;
    },
    staleTime: 60_000,
  });
  const host = serverUrl.replace(/^https?:\/\//, '');
  return (
    <span className="home-conn readout" data-testid="connection">
      <span className="home-conn-dot" aria-hidden="true" />
      {info.data ? `${info.data.ServerName ?? host} · v${info.data.Version ?? '?'}` : host}
    </span>
  );
}

/** Web bundle build identity readout — same object the auth Version header uses (issue #26, §9(a)). */
export function WebBuildReadout() {
  return (
    <span className="home-build readout" data-testid="web-build" title={webBuild.commit}>
      {describeWebBuild(webBuild)}
    </span>
  );
}

/** Item card shared by every shelf: poster + link + user-data overlays. */
function ItemCard(props: {
  serverUrl: string;
  item: {
    Id?: string;
    Name?: string | null;
    ProductionYear?: number | null;
    ImageTags?: { [key: string]: string | null } | null;
    ImageBlurHashes?: { Primary?: { [key: string]: string | null } | null } | null;
    UserData?: { PlayedPercentage?: number | null; Played?: boolean | null } | null;
  };
}) {
  const { serverUrl, item } = props;
  return (
    <Link to={`/item/${item.Id}`} className="card-link" data-testid="item-link">
      <Poster
        title={item.Name ?? 'Untitled'}
        imageUrl={primaryImageUrl(serverUrl, item)}
        blurhash={primaryBlurhash(item)}
        year={item.ProductionYear}
        progress={item.UserData?.PlayedPercentage ?? 0}
        played={item.UserData?.Played ?? false}
      />
    </Link>
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
        <span className="shelf-name">Continue the descent</span>
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

function Libraries({ api, serverUrl, userId }: { api: Api; serverUrl: string; userId: string }) {
  const views = useQuery({
    queryKey: ['user-views', userId],
    queryFn: async () => {
      const { data, error } = await api.GET('/UserViews', {
        params: { query: { userId } },
      });
      if (error !== undefined) throw new Error('UserViews failed');
      return data?.Items ?? [];
    },
  });

  if (views.isPending) return <p className="home-status readout">sounding…</p>;
  if (views.isError)
    return (
      <p className="home-status readout" role="alert">
        ▲ lost contact with the server
      </p>
    );
  if (views.data.length === 0)
    return (
      <p className="home-status readout" data-testid="empty-views">
        no libraries in range — add one from the admin dashboard (/web)
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

/** What a shelf shows for each library kind; unknown kinds list direct children. */
const SHELF_ITEM_TYPES: Record<string, ('Movie' | 'Series' | 'MusicAlbum')[]> = {
  movies: ['Movie'],
  tvshows: ['Series'],
  music: ['MusicAlbum'],
};

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
  const itemTypes = collectionType ? SHELF_ITEM_TYPES[collectionType] : undefined;
  const items = useQuery({
    queryKey: ['shelf', userId, viewId],
    queryFn: async () => {
      const { data, error } = await api.GET('/Items', {
        params: {
          query: {
            userId,
            parentId: viewId,
            recursive: itemTypes !== undefined,
            includeItemTypes: itemTypes,
            sortBy: ['SortName'],
            sortOrder: ['Ascending'],
            limit: 30,
            enableUserData: true,
            imageTypeLimit: 1,
            enableImageTypes: ['Primary'],
          },
        },
      });
      if (error !== undefined) throw new Error(`Items failed for view ${viewId}`);
      return data?.Items ?? [];
    },
    enabled: viewId !== '',
  });

  return (
    <section className="shelf" style={{ animationDelay: `${0.08 * index}s` }} data-testid="shelf">
      <h2 className="shelf-head">
        <span className="shelf-name">{name}</span>
        <span className="readout">
          {items.data ? `${items.data.length} in range` : '· · ·'}
        </span>
      </h2>
      {items.isError ? (
        <p className="home-status readout" role="alert">
          ▲ shelf unreadable
        </p>
      ) : (
        <div className="shelf-grid">
          {(items.data ?? []).map((item) => (
            <ItemCard key={item.Id} serverUrl={serverUrl} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
