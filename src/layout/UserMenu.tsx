import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { useCurrentUser } from '../api/currentUser';
import { useServerInfo } from '../api/serverInfo';
import { About } from '../components/About';
import { paths } from '../routes/paths';

/**
 * The avatar menu at the right of the app bar, in jellyfin-web `AppUserMenu`
 * order: Quick Connect, Dashboard (administrators), then Sign out.
 */
export function UserMenu() {
  const { session, api, signOut } = useAuth();
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session || !api) return null;
  const isAdmin = me.data?.Policy?.IsAdministrator ?? false;
  const imageTag = me.data?.PrimaryImageTag;
  const close = () => setOpen(false);

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="appbar-icon user-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`User menu: ${session.userName}`}
        title={session.userName}
        data-testid="user-menu-button"
        onClick={() => setOpen((o) => !o)}
      >
        {imageTag ? (
          <img
            src={`${session.serverUrl}/Users/${session.userId}/Images/Primary?tag=${imageTag}&height=64`}
            alt=""
          />
        ) : (
          <span aria-hidden="true">{session.userName.slice(0, 1).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-panel" role="menu" data-testid="user-menu">
          <p className="user-menu-name">{session.userName}</p>
          <Link role="menuitem" to={paths.quickConnect} onClick={close} data-testid="quick-connect-link">
            Quick Connect
          </Link>
          {isAdmin && (
            <Link role="menuitem" to={paths.dashboard} onClick={close} data-testid="dashboard-link">
              Dashboard
            </Link>
          )}
          <AboutEntry />
          <button
            type="button"
            role="menuitem"
            data-testid="sign-out"
            onClick={() => {
              close();
              signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function AboutEntry() {
  const { session, api } = useAuth();
  const { identity } = useServerInfo(api!, session!.serverUrl);
  return <About serverUrl={session!.serverUrl} identity={identity} />;
}
