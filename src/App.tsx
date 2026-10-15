import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './api/AuthContext';
import { Home } from './pages/Home';
import { ItemDetail } from './pages/ItemDetail';
import { Library } from './pages/Library';
import { Login } from './pages/Login';
import { Player } from './pages/Player';
import { Setup } from './pages/Setup';
import { QuickConnect } from './pages/QuickConnect';

export function App() {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/setup" element={session ? <Navigate to="/" replace /> : <Setup />} />
      <Route path="/" element={session ? <Home /> : <Navigate to="/login" replace />} />
      <Route
        path="/library/:viewId"
        element={session ? <Library /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/item/:itemId"
        element={session ? <ItemDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/play/:itemId"
        element={session ? <Player /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/quickconnect"
        element={session ? <QuickConnect /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
