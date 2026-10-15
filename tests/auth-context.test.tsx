import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/api/AuthContext';
import { loadSession, saveSession } from '../src/api/session';

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return null;
}

function mount(queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  auth = null;
});

describe('signOut', () => {
  it('posts /Sessions/Logout with the token, then clears the session', async () => {
    saveSession({ serverUrl: 'http://srv', accessToken: 'tok-1', userId: 'u', userName: 'n' });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const qc = mount();
    qc.setQueryData(['shelf', 'u'], ['cached']);

    act(() => auth!.signOut());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const req = (fetchMock.mock.calls[0] as unknown as [Request])[0];
    expect(req.url).toBe('http://srv/Sessions/Logout');
    expect(req.method).toBe('POST');
    expect(req.headers.get('Authorization')).toContain('Token="tok-1"');
    expect(loadSession()).toBeNull();
    expect(auth!.session).toBeNull();
    expect(qc.getQueryData(['shelf', 'u'])).toBeUndefined();
  });

  it('still signs out locally when the server call fails', async () => {
    saveSession({ serverUrl: 'http://srv', accessToken: 'tok-1', userId: 'u', userName: 'n' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    mount();
    act(() => auth!.signOut());
    expect(loadSession()).toBeNull();
    expect(auth!.session).toBeNull();
  });
});
