import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { fetchUserViews, type BaseItem } from '../api/library';
import { useServerInfo } from '../api/serverInfo';
import { SharkMark } from '../components/SharkMark';
import { libraryUrl, paths } from '../routes/paths';
import { UserMenu } from './UserMenu';
import './layout.css';

/**
 * The frame of every signed-in page except the player: app bar and main
 * drawer, as jellyfin-web `AppToolbar` and `MainDrawerContent`.
 */
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="app-frame">
      <AppBar drawerOpen={drawerOpen} onDrawerButton={() => setDrawerOpen((o) => !o)}>
        <SearchButton />
      </AppBar>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Main menu">
        <MainDrawerContent />
      </Drawer>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}

export function AppBar(props: {
  drawerOpen: boolean;
  onDrawerButton: () => void;
  title?: ReactNode;
  drawerButtonClass?: string;
  children?: ReactNode;
}) {
  const { session, api } = useAuth();
  const { info } = useServerInfo(api!, session!.serverUrl);
  const host = session!.serverUrl.replace(/^https?:\/\//, '');
  return (
    <header className="appbar">
      <button
        type="button"
        className={`appbar-icon appbar-drawer-button ${props.drawerButtonClass ?? ''}`}
        aria-label="Menu"
        aria-expanded={props.drawerOpen}
        data-testid="drawer-button"
        onClick={props.onDrawerButton}
      >
        <MenuIcon />
      </button>
      <Link to={paths.home} className="appbar-server" data-testid="connection">
        <SharkMark size={26} />
        <span>{info?.ServerName ?? host}</span>
      </Link>
      {props.title && <span className="appbar-title">{props.title}</span>}
      <div className="appbar-buttons">
        {props.children}
        <UserMenu />
      </div>
    </header>
  );
}

function SearchButton() {
  return (
    <Link to={paths.search} className="appbar-icon" aria-label="Search" title="Search" data-testid="search-link">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"
        />
      </svg>
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z" />
    </svg>
  );
}

/**
 * A drawer that slides over the page. `persistent` keeps it open beside the
 * content on wide screens (the dashboard).
 */
export function Drawer(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  persistent?: boolean;
  children: ReactNode;
}) {
  const { open, onClose } = props;
  const location = useLocation();
  // Following a link closes the drawer.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const cls = ['drawer', open ? 'is-open' : '', props.persistent ? 'is-persistent' : ''].join(' ');
  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />}
      <nav className={cls} aria-label={props.label} data-testid="drawer">
        {props.children}
      </nav>
    </>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'drawer-link is-active' : 'drawer-link');

/** Home, Favorites, then the user's libraries. */
function MainDrawerContent() {
  const { session, api } = useAuth();
  const location = useLocation();
  const views = useQuery({
    queryKey: ['user-views', session!.userId],
    queryFn: () => fetchUserViews(api!, session!.userId),
  });
  const tab = new URLSearchParams(location.search).get('tab');
  const onHome = location.pathname === paths.home;
  return (
    <>
      <ul className="drawer-list">
        <li>
          <Link to={paths.home} className={onHome && (!tab || tab === '0') ? 'drawer-link is-active' : 'drawer-link'}>
            <DrawerIcon d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            Home
          </Link>
        </li>
        <li>
          <Link to={paths.favorites} className={onHome && tab === '1' ? 'drawer-link is-active' : 'drawer-link'}>
            <DrawerIcon d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z" />
            Favorites
          </Link>
        </li>
      </ul>
      {views.data && views.data.length > 0 && (
        <ul className="drawer-list" aria-labelledby="drawer-libraries">
          <li className="drawer-subheader" id="drawer-libraries">
            Libraries
          </li>
          {views.data.map((v) => (
            <li key={v.Id}>
              <NavLink to={libraryUrl(v.Id ?? '')} className={navClass} data-testid="drawer-library">
                <DrawerIcon d={libraryIcon(v)} />
                {v.Name}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DrawerIcon({ d }: { d: string }) {
  return (
    <svg className="drawer-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

/** Material icon paths per collection type, as jellyfin-web `LibraryIcon`. */
function libraryIcon(view: BaseItem): string {
  switch (view.CollectionType) {
    case 'movies':
      return 'm18 4 2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4z';
    case 'tvshows':
      return 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2m0 14H3V5h18z';
    case 'music':
      return 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z';
    case 'livetv':
      return 'M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2m0 14H3V8h18z';
    case 'playlists':
      return 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z';
    case 'boxsets':
      return 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2';
    case 'homevideos':
    case 'photos':
      return 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z';
    case 'books':
      return 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M6 4h5v8l-2.5-1.5L6 12z';
    default:
      return 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z';
  }
}
