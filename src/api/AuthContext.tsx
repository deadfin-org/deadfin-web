import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createApi, type Api } from './client';
import { clearSession, loadSession, normalizeServerUrl, saveSession, type Session } from './session';

interface Auth {
  session: Session | null;
  api: Api | null;
  signIn: (serverUrl: string, username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

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
    setSession(next);
  }, []);

  const queryClient = useQueryClient();

  // Sign-out ends the server session too (POST /Sessions/Logout deletes the
  // device and its token), then forgets the local one whether or not the
  // server answered. No keepalive: Chromium refuses keepalive requests that
  // need a CORS preflight, and the page stays loaded anyway.
  const signOut = useCallback(() => {
    const current = loadSession();
    if (current) {
      void createApi(current.serverUrl, current.accessToken)
        .POST('/Sessions/Logout')
        .catch(() => undefined);
    }
    clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<Auth>(
    () => ({
      session,
      api: session ? createApi(session.serverUrl, session.accessToken) : null,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
