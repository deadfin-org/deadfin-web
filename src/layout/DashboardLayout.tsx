import { useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '../api/currentUser';
import { dashboardRoutes } from '../routes/dashboard';
import { visibleDashboardNav, type DashboardNavEntry } from '../routes/dashboardNav';
import { paths } from '../routes/paths';
import { AppBar, Drawer, DrawerIcon } from './AppLayout';
import './layout.css';

/**
 * The administrator frame at `/dashboard`: app bar plus the dashboard drawer
 * (Server, Devices, Live TV, Advanced, Plugins), as jellyfin-web
 * apps/dashboard. Other users go back to Home.
 */
export function DashboardLayout() {
  const me = useCurrentUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (me.isPending) return <p className="home-status readout">Loading…</p>;
  if (!me.data?.Policy?.IsAdministrator) return <Navigate to={paths.home} replace />;
  return (
    <div className="app-frame dashboard-frame" data-testid="dashboard">
      <AppBar
        drawerOpen={drawerOpen}
        onDrawerButton={() => setDrawerOpen((o) => !o)}
        drawerButtonClass="is-narrow-only"
        title="Dashboard"
      />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Dashboard menu" persistent>
        <DashboardDrawerContent />
      </Drawer>
      <div className="app-content dashboard-content">
        <Outlet />
      </div>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'drawer-link is-active' : 'drawer-link');

function DashboardDrawerContent() {
  const sections = useMemo(() => visibleDashboardNav(new Set(dashboardRoutes.map((r) => r.path))), []);
  return (
    <>
      <ul className="drawer-list">
        <li>
          <Link to={paths.home} className="drawer-link" data-testid="dashboard-exit">
            <DrawerIcon d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            Home
          </Link>
        </li>
      </ul>
      {sections.map((s) => (
        <ul key={s.title} className="drawer-list" aria-label={s.title}>
          <li className="drawer-subheader">{s.title}</li>
          {groupEntries(s.entries).map((g) =>
            g.group ? (
              <li key={g.group}>
                <span className="drawer-group">{g.group}</span>
                <ul className="drawer-list drawer-nested">
                  {g.entries.map((e) => (
                    <li key={e.path}>
                      <NavLink to={`/dashboard/${e.path}`} end className={navClass}>
                        {e.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={g.entries[0]!.path}>
                <NavLink to={`/dashboard/${g.entries[0]!.path}`.replace(/\/$/, '')} end className={navClass}>
                  {g.entries[0]!.label}
                </NavLink>
              </li>
            ),
          )}
        </ul>
      ))}
    </>
  );
}

/** Runs of entries that share a group fold under one heading. */
function groupEntries(entries: DashboardNavEntry[]): { group?: string; entries: DashboardNavEntry[] }[] {
  const out: { group?: string; entries: DashboardNavEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (e.group && last?.group === e.group) last.entries.push(e);
    else out.push({ group: e.group, entries: [e] });
  }
  return out;
}
