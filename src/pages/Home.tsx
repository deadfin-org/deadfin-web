import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import type { Api } from '../api/client';
import { countLabel, fetchUserViews, libraryItemsQuery } from '../api/library';
import { describeServer, fetchServerIdentity } from '../api/serverBuild';
import { fetchNextUp } from '../api/tv';
import { describeWebBuild, webBuild } from '../build';
import { About } from '../components/About';
import { ItemCard } from '../components/ItemCard';
import { SharkMark } from '../components/SharkMark';
import './home.css';
import './library.css';

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
          <Link className="home-signout readout" to="/search" data-testid="search-link">
            search
          </Link>
          <span className="readout">{session.userName}</span>
          <Link className="home-signout readout" to="/quickconnect" data-testid="quick-connect-link">
            sign in a device
          </Link>
          <AboutMenu api={api} serverUrl={session.serverUrl} />
          <button className="home-signout readout" onClick={signOut}>
            surface ↑
          </button>
        </div>
      </header>

      <main className="home-main">
        <ResumeShelf api={api} serverUrl={session.serverUrl} userId={session.userId} />
        <NextUpShelf api={api} serverUrl={session.serverUrl} userId={session.userId} />
        <Libraries api={api} serverUrl={session.serverUrl} userId={session.userId} />
      </main>
    </div>
  );
}

function useServerInfo(api: Api, serverUrl: string) {
  const info = useQuery({
    queryKey: ['system-info', serverUrl],
    queryFn: async () => {
      const { data, error } = await api.GET('/System/Info/Public');
      if (error !== undefined) throw new Error('System/Info/Public failed');
      return data;
    },
    staleTime: 60_000,
  });
  const identity = useQuery({
    queryKey: ['server-identity', serverUrl],
    queryFn: () => fetchServerIdentity(api, serverUrl),
    staleTime: 5 * 60_000,
  });
  return { info: info.data, identity: identity.data };
}

function ConnectionReadout({ api, serverUrl }: { api: Api; serverUrl: string }) {
  const { info, identity } = useServerInfo(api, serverUrl);
  const host = serverUrl.replace(/^https?:\/\//, '');
  return (
    <span className="home-conn readout" data-testid="connection">
      <span className="home-conn-dot" aria-hidden="true" />
      {info?.ServerName ?? host}
      {identity && <span data-testid="server-build"> · {describeServer(identity)}</span>}
    </span>
  );
}

function AboutMenu({ api, serverUrl }: { api: Api; serverUrl: string }) {
  const { identity } = useServerInfo(api, serverUrl);
  return <About serverUrl={serverUrl} identity={identity} />;
}

/** Web bundle build identity readout — same object the auth Version header uses (issue #26, §9(a)). */
export function WebBuildReadout() {
  return (
    <span className="home-build readout" data-testid="web-build" title={webBuild.commit}>
      {describeWebBuild(webBuild)}
    </span>
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
        <span className="shelf-name">Next up</span>
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
        <Link to={`/library/${viewId}`} className="shelf-name shelf-name-link" data-testid="shelf-link">
          {name}
        </Link>
        <Link to={`/library/${viewId}`} className="readout shelf-name-link" data-testid="shelf-count">
          {items.data ? `${countLabel(items.data.total)} · see all →` : '· · ·'}
        </Link>
      </h2>
      {items.isError ? (
        <p className="home-status readout" role="alert">
          ▲ shelf unreadable
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
