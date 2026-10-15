import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createApi, type Api } from './client';
import { clearSession, loadSession, normalizeServerUrl, saveSession, type Session } from './session';

interface Auth {
  session: Session | null;
  api: Api | null;
  signIn: (serverUrl: string, username: string, password: string) => Promise<void>;
  signOut: () => void;
  /** True after the server rejected the stored token; cleared by the next sign-in. */
  sessionEnded: boolean;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [sessionEnded, setSessionEnded] = useState(false);
  const queryClient = useQueryClient();
  const current = useRef(session);
  current.current = session;

  // A 401 on an authenticated call: the token is revoked or expired. Only the
  // token that got the 401 is dropped, so a late answer to an old session's
  // request cannot sign out a newer one.
  const expire = useCallback(
    (token: string) => {
      if (current.current?.accessToken !== token) return;
      current.current = null;
      clearSession();
      setSession(null);
      setSessionEnded(true);
      queryClient.clear();
    },
    [queryClient],
  );

  const signIn = useCallback(async (serverInput: string, username: string, password: string) => {
    const serverUrl = normalizeServerUrl(serverInput);
    const anon = createApi(serverUrl);
    const { data, error, response } = await anon.POST('/Users/AuthenticateByName', {
      body: { Username: username, Pw: password },
    });
    if (error !== undefined || !data?.AccessToken || !data.User?.Id) {
      if (response.status === 401) throw new Error('Wrong operator name or passphrase.');
      throw new Error(`Server refused the descent (HTTP ${response.status}).`);
    }
    const next: Session = {
      serverUrl,
      accessToken: data.AccessToken,
      userId: data.User.Id,
      userName: data.User.Name ?? username,
    };
    saveSession(next);
    setSessionEnded(false);
    setSession(next);
  }, []);

  // Sign-out ends the server session too (POST /Sessions/Logout deletes the
  // device and its token), then forgets the local one whether or not the
  // server answered. No keepalive: Chromium refuses keepalive requests that
  // need a CORS preflight, and the page stays loaded anyway.
  const signOut = useCallback(() => {
    const saved = loadSession();
    if (saved) {
      void createApi(saved.serverUrl, saved.accessToken)
        .POST('/Sessions/Logout')
        .catch(() => undefined);
    }
    // A request still in flight may 401 now; that is not "your session ended".
    current.current = null;
    clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<Auth>(
    () => ({
      session,
      api: session
        ? createApi(session.serverUrl, session.accessToken, () => expire(session.accessToken))
        : null,
      signIn,
      signOut,
      sessionEnded,
    }),
    [session, signIn, signOut, sessionEnded, expire],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
