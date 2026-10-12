import { create } from 'zustand';

/**
 * Auth state lives in memory only. The refresh token is an httpOnly cookie, so a page reload
 * restores the session through POST /auth/refresh (see bootstrapSession).
 * status: 'idle' (not checked yet) | 'authenticated' | 'guest'
 */
export const useAuthStore = create((set) => ({
  status: 'idle',
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) =>
    set((s) => ({ status: 'authenticated', accessToken, user: user ?? s.user })),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'guest', accessToken: null, user: null }),
}));

export const getAccessToken = () => useAuthStore.getState().accessToken;
export const isStaffRole = (role) => role === 'admin' || role === 'staff';
