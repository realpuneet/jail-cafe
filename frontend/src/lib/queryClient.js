import { QueryClient } from '@tanstack/react-query';

/** Do not retry client errors; retry transient failures twice. */
const retry = (count, error) => {
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return count < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry,
    },
    mutations: { retry: false },
  },
});
