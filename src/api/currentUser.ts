import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

/** The signed-in user (`/Users/Me`): name, policy, primary image tag. */
export function useCurrentUser() {
  const { api, session } = useAuth();
  return useQuery({
    queryKey: ['users-me', session?.serverUrl, session?.userId],
    enabled: !!api,
    queryFn: async () => {
      const { data, error } = await api!.GET('/Users/Me');
      if (error !== undefined || !data) throw new Error('Users/Me failed');
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** True when the signed-in user is an administrator; false while unknown. */
export function useIsAdmin(): boolean {
  return useCurrentUser().data?.Policy?.IsAdministrator ?? false;
}
