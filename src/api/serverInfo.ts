import { useQuery } from '@tanstack/react-query';
import type { Api } from './client';
import { fetchServerIdentity } from './serverBuild';

/** Public server info (name, version) and the server build identity. */
export function useServerInfo(api: Api, serverUrl: string) {
  const info = useQuery({
    queryKey: ['system-info', serverUrl],
    queryFn: async () => {
      const { data, error } = await api.GET('/System/Info/Public');
      if (error !== undefined) throw new Error('System/Info/Public failed');
      return data;
    },
    staleTime: 60_000,
  });
  const identity = useQuery({
    queryKey: ['server-identity', serverUrl],
    queryFn: () => fetchServerIdentity(api, serverUrl),
    staleTime: 5 * 60_000,
  });
  return { info: info.data, identity: identity.data };
}
