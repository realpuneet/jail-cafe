import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshSession } from '../../lib/axios.js';
import { connectSocket, disconnectSocket } from '../../lib/socket.js';
import { toast } from '../ui/uiStore.js';
import { mergeGuestCart } from '../cart/guestCart.js';
import { logoutRequest } from './api.js';
import { useAuthStore } from './authStore.js';

/** Restore the session once on app start from the httpOnly refresh cookie. */
export function useBootstrapSession() {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (useAuthStore.getState().status === 'idle') {
      refreshSession().catch(() => useAuthStore.getState().clear());
    }
  }, []);
  return status;
}

/** Keep the realtime socket in step with auth, and surface pushed notifications. */
export function useRealtimeSession() {
  const status = useAuthStore((s) => s.status);
  const qc = useQueryClient();
  useEffect(() => {
    if (status !== 'authenticated') {
      disconnectSocket();
      return undefined;
    }
    const socket = connectSocket();
    const onNotification = (n) => {
      toast.info(n.title);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification:new', onNotification);
    return () => socket.off('notification:new', onNotification);
  }, [status, qc]);
}

/** Start a session after login: store tokens, bring over the guest cart, reset cached user data. */
export async function startSession(session, queryClient) {
  useAuthStore.getState().setSession(session);
  queryClient.removeQueries();
  await mergeGuestCart().catch(() => {});
  queryClient.invalidateQueries({ queryKey: ['cart'] });
}

export async function endSession(queryClient) {
  await logoutRequest().catch(() => {});
  useAuthStore.getState().clear();
  disconnectSocket();
  queryClient.clear();
}
