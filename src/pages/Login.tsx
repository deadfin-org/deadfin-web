import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { SharkMark } from '../components/SharkMark';
import './login.css';

export function Login() {
  const { signIn, sessionEnded } = useAuth();
  const navigate = useNavigate();
  const [server, setServer] = useState(() => defaultServer());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(server, username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The descent failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-depthticks readout" aria-hidden="true">
        {['0 m', '−200 m', '−1000 m', '−4000 m', '−10935 m'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-mark">
          <SharkMark size={104} ping={busy} />
        </div>
        <h1 className="login-word">DEADFIN</h1>
        <p className="login-sub readout">media system · abyssal division</p>

        <label className="field">
          <span className="readout">server</span>
          <input
            name="server"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="https://deadfin.local:8096"
            autoComplete="url"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span className="readout">operator</span>
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span className="readout">passphrase</span>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {!error && sessionEnded && (
          <p className="login-error readout" role="status" data-testid="session-ended">
            Your session ended. Sign in again.
          </p>
        )}

        {error && (
          <p className="login-error readout" role="alert">
            ▲ {error}
          </p>
        )}

        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? 'descending…' : 'Descend'}
        </button>
      </form>
    </main>
  );
}

/** Same-origin default when the app is served by a Deadfin server itself. */
function defaultServer(): string {
  if (import.meta.env.VITE_DEFAULT_SERVER) return import.meta.env.VITE_DEFAULT_SERVER as string;
  if (typeof window !== 'undefined' && window.location.port !== '5210' && window.location.port !== '5211') {
    return window.location.origin;
  }
  return '';
}
