import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './api/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { DashboardLayout } from './layout/DashboardLayout';
import { Login } from './pages/Login';
import { Player } from './pages/Player';
import { Setup } from './pages/Setup';
import { dashboardRoutes } from './routes/dashboard';
import { legacyRedirect, paths } from './routes/paths';
import { userRoutes } from './routes/user';

export function App() {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to={paths.home} replace /> : <Login />} />
      <Route path="/setup" element={session ? <Navigate to={paths.home} replace /> : <Setup />} />
      <Route element={session ? <Outlet /> : <Navigate to={paths.login} replace />}>
        <Route path="/video" element={<Player />} />
        <Route element={<AppLayout />}>
          {userRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Route>
        <Route path="/dashboard" element={<DashboardLayout />}>
          {dashboardRoutes.map((r) =>
            r.path === '' ? (
              <Route key="index" index element={r.element} />
            ) : (
              <Route key={r.path} path={r.path} element={r.element} />
            ),
          )}
        </Route>
      </Route>
      <Route path="*" element={<Fallback />} />
    </Routes>
  );
}

/** Old deadfin-web paths go to their jellyfin-web form; anything else goes Home. */
function Fallback() {
  const location = useLocation();
  return <Navigate to={legacyRedirect(location.pathname, location.search) ?? paths.home} replace />;
}
