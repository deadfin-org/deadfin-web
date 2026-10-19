import { useState, type FormEvent } from 'react';
import { useAuth } from '../api/AuthContext';
import { authorizeQuickConnect, normalizeCode } from '../api/quickConnect';
import './login.css';
import './quick-connect.css';

/** Sign in another device (a TV app, a phone) by typing the code it shows. */
export function QuickConnect() {
  const { session, api } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!session || !api) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    setBusy(true);
    setError(null);
    setDone(null);
    authorizeQuickConnect(api, c, session.userId)
      .then(() => {
        setDone(c);
        setCode('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.'))
      .finally(() => setBusy(false));
  };

  return (
    <main className="qc">
      <form className="qc-panel" onSubmit={submit}>
        <h1 className="qc-head">Quick Connect</h1>
        <p className="qc-note">
          On the TV or phone, choose Quick Connect. Type the code it shows here to sign it in as{' '}
          <strong>{session.userName}</strong>.
        </p>
        <label className="field">
          <span className="readout">Code</span>
          <input
            name="quick-connect-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </label>
        {error && (
          <p className="login-error readout" role="alert">
            ▲ {error}
          </p>
        )}
        {done && (
          <p className="qc-done readout" role="status" data-testid="quick-connect-done">
            ✓ The device with code {done} is signed in.
          </p>
        )}
        <button className="login-submit" type="submit" disabled={busy || !normalizeCode(code)}>
          {busy ? 'Signing in…' : 'Sign in device'}
        </button>
      </form>
    </main>
  );
}
