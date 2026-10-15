import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { createApi } from '../api/client';
import { defaultServerFor, normalizeServerUrl } from '../api/session';
import {
  addLibrary,
  completeSetup,
  loadStartup,
  saveAdmin,
  saveRemoteAccess,
  saveSettings,
  type NewLibrary,
  type ServerSettings,
} from '../api/setup';
import { LibraryForm } from '../components/LibraryForm';
import { SharkMark } from '../components/SharkMark';
import './login.css';
import './setup.css';

export const SETUP_STEPS = ['Server', 'Administrator', 'Libraries', 'Remote access'] as const;

/** First-run setup: the Jellyfin startup wizard, on the /Startup/* endpoints. */
export function Setup() {
  const [params] = useSearchParams();
  const serverUrl = useMemo(() => {
    const raw = params.get('server') ?? defaultServerFor(window.location);
    try {
      return normalizeServerUrl(raw);
    } catch {
      return '';
    }
  }, [params]);
  const api = useMemo(() => createApi(serverUrl), [serverUrl]);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [adminName, setAdminName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [libraries, setLibraries] = useState<NewLibrary[]>([]);
  const [remote, setRemote] = useState(true);

  useEffect(() => {
    loadStartup(api)
      .then((s) => {
        setSettings(s.settings);
        setAdminName(s.adminName);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The server did not answer.'));
  }, [api]);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const submitSettings = (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    void run(async () => {
      await saveSettings(api, settings);
      setStep(1);
    });
  };

  const submitAdmin = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    void run(async () => {
      await saveAdmin(api, adminName.trim(), password);
      setStep(2);
    });
  };

  const submitLibrary = (lib: NewLibrary) =>
    run(async () => {
      await addLibrary(api, lib);
      setLibraries((l) => [...l, lib]);
    });

  const finish = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await saveRemoteAccess(api, remote);
      await completeSetup(api);
      await signIn(serverUrl, adminName.trim(), password);
      navigate('/', { replace: true });
    });
  };

  return (
    <main className="login setup">
      <div className="login-panel setup-panel">
        <div className="login-mark">
          <SharkMark size={72} ping={busy} />
        </div>
        <h1 className="login-word">DEADFIN</h1>
        <p className="login-sub readout">set up this server · {serverUrl.replace(/^https?:\/\//, '')}</p>

        <ol className="setup-steps readout" aria-label="Setup steps">
          {SETUP_STEPS.map((name, i) => (
            <li key={name} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              {i < step ? '✓' : i + 1} {name}
            </li>
          ))}
        </ol>

        {error && (
          <p className="login-error readout" role="alert" data-testid="setup-error">
            ▲ {error}
          </p>
        )}

        {step === 0 && settings && (
          <form className="setup-form" onSubmit={submitSettings}>
            <h2 className="setup-head">Server</h2>
            <label className="field">
              <span className="readout">Server name</span>
              <input
                name="server-name"
                value={settings.ServerName}
                onChange={(e) => setSettings({ ...settings, ServerName: e.target.value })}
                placeholder="Living room"
              />
            </label>
            <label className="field">
              <span className="readout">Metadata language (ISO code, e.g. en, de, fr)</span>
              <input
                name="metadata-language"
                value={settings.PreferredMetadataLanguage}
                onChange={(e) => setSettings({ ...settings, PreferredMetadataLanguage: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="readout">Metadata country (ISO code, e.g. US, DE, FR)</span>
              <input
                name="metadata-country"
                value={settings.MetadataCountryCode}
                onChange={(e) => setSettings({ ...settings, MetadataCountryCode: e.target.value })}
                required
              />
            </label>
            <button className="login-submit" type="submit" disabled={busy}>
              Next
            </button>
          </form>
        )}

        {step === 1 && (
          <form className="setup-form" onSubmit={submitAdmin}>
            <h2 className="setup-head">Administrator</h2>
            <p className="setup-note">This account manages the server. You can add other users later.</p>
            <label className="field">
              <span className="readout">Username</span>
              <input
                name="admin-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              <span className="readout">Password</span>
              <input
                name="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span className="readout">Confirm password</span>
              <input
                name="admin-password-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="login-submit" type="submit" disabled={busy}>
              Next
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="setup-form">
            <h2 className="setup-head">Libraries</h2>
            <p className="setup-note">
              Point each library at a folder the server can read, such as a folder you mounted into the container.
              You can add more later.
            </p>
            {libraries.length > 0 && (
              <ul className="setup-libraries" data-testid="setup-libraries">
                {libraries.map((l) => (
                  <li key={l.name} className="readout">
                    ✓ {l.name} — {l.paths.join(', ')}
                  </li>
                ))}
              </ul>
            )}
            <LibraryForm api={api} busy={busy} onSubmit={submitLibrary} />
            <button className="login-submit" type="button" onClick={() => setStep(3)} disabled={busy}>
              {libraries.length ? 'Next' : 'Skip for now'}
            </button>
          </div>
        )}

        {step === 3 && (
          <form className="setup-form" onSubmit={finish}>
            <h2 className="setup-head">Remote access</h2>
            <label className="setup-check">
              <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
              <span>Allow connections from outside the local network</span>
            </label>
            <p className="setup-note">
              Turn this off if the server is only for your home network. A reverse proxy in front of the server counts
              as remote.
            </p>
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? 'Finishing…' : 'Finish and sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
