import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../../lib/axios.js';
import { lineKey, recalcCart, emptyCart } from './pricing.js';

/**
 * Cart for signed-out visitors, kept in localStorage. Lines carry a display snapshot (name,
 * price, image) because there is no server cart yet. On login they are merged into the server
 * cart, which re-validates and re-prices everything.
 */
export const useGuestCart = create(
  persist(
    (set, get) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const key = lineKey(line);
          const existing = s.lines.find((l) => lineKey(l) === key);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l === existing ? { ...l, quantity: Math.min(l.quantity + line.quantity, 20) } : l,
              ),
            };
          }
          return { lines: [...s.lines, line] };
        }),
      setQuantity: (lineId, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.lineId !== lineId)
              : s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
        })),
      clear: () => set({ lines: [] }),
      view: () => recalcCart({ ...emptyCart(), items: get().lines }),
    }),
    { name: 'jkc-guest-cart', version: 1, partialize: (s) => ({ lines: s.lines }) },
  ),
);

/** Push guest lines into the server cart (best effort per line), then clear them. */
export async function mergeGuestCart() {
  const { lines, clear } = useGuestCart.getState();
  if (!lines.length) return;
  for (const l of lines) {
    try {
      await api.post('/cart/items', {
        menuItemId: l.menuItemId,
        variantId: l.variantId,
        addOnIds: l.addOnIds ?? [],
        quantity: l.quantity,
        note: l.note,
      });
    } catch {
      // item may be gone or sold out: skip it
    }
  }
  clear();
}
