import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../lib/axios.js';
import { keys } from '../../lib/queryKeys.js';

/** Unread badge count (cheap indexed count on the server). */
export const useUnreadCount = (enabled = true) =>
  useQuery({
    queryKey: keys.unread,
    queryFn: () => api.get('/notifications/unread-count').then(unwrap),
    enabled,
    staleTime: 30_000,
    select: (d) => d.count,
  });
