import { create } from 'zustand';
import { persist } from 'zustand/middleware';

let toastSeq = 0;

/** Client-only UI state: theme (persisted), cart drawer, toasts. */
export const useUiStore = create(
  persist(
    (set, get) => ({
      theme: null, // null = follow the OS
      cartOpen: false,
      toasts: [],
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      toggleTheme: () => {
        const dark = document.documentElement.dataset.theme === 'dark';
        get().setTheme(dark ? 'light' : 'dark');
      },
      openCart: () => set({ cartOpen: true }),
      closeCart: () => set({ cartOpen: false }),
      pushToast: (toast) => {
        const id = ++toastSeq;
        // Same message again (e.g. tapping Add twice): replace instead of stacking.
        set((s) => ({
          toasts: [
            ...s.toasts.filter((t) => t.message !== toast.message).slice(-2),
            { id, type: 'info', ...toast },
          ],
        }));
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    { name: 'jkc-ui', partialize: (s) => ({ theme: s.theme }) },
  ),
);

export function applyTheme(theme) {
  const dark =
    theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

/** Imperative toast helpers usable outside React. */
export const toast = {
  success: (message) => useUiStore.getState().pushToast({ type: 'success', message }),
  error: (message) => useUiStore.getState().pushToast({ type: 'error', message }),
  info: (message) => useUiStore.getState().pushToast({ type: 'info', message }),
};
