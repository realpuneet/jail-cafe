import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toApiError } from '../../lib/apiError.js';
import { keys } from '../../lib/queryKeys.js';
import { useAuthStore } from '../auth/authStore.js';
import { toast, useUiStore } from '../ui/uiStore.js';
import * as cartApi from './api.js';
import { useGuestCart } from './guestCart.js';
import { buildLine, emptyCart, lineKey, recalcCart } from './pricing.js';

/**
 * One cart API for guests (localStorage) and signed-in users (server, optimistic updates).
 * `view` always has the server's shape: { items, coupon, summary, hasIssues }.
 */
export function useCart() {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const qc = useQueryClient();
  const guestLines = useGuestCart((s) => s.lines);
  const guest = useGuestCart.getState;

  const query = useQuery({
    queryKey: keys.cart,
    queryFn: cartApi.fetchCart,
    enabled: authed,
    staleTime: 30_000,
  });
  const view = authed
    ? (query.data ?? emptyCart())
    : recalcCart({ ...emptyCart(), items: guestLines });

  /** Optimistic helper: edit the cached cart now, roll back on failure, resync afterwards. */
  const optimistic = (mutationFn, edit, failure) => ({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: keys.cart });
      const previous = qc.getQueryData(keys.cart);
      qc.setQueryData(keys.cart, (old) =>
        recalcCart(edit(structuredClone(old ?? emptyCart()), vars)),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(keys.cart, ctx?.previous);
      toast.error(toApiError(err).message || failure);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.cart }),
  });

  const addServer = useMutation(
    optimistic(
      ({ payload }) => cartApi.addCartItem(payload),
      (cart, { line }) => {
        const existing = cart.items.find((l) => lineKey(l) === lineKey(line));
        if (existing) existing.quantity = Math.min(existing.quantity + line.quantity, 20);
        else cart.items.push(line);
        return cart;
      },
      'Could not add to cart',
    ),
  );
  const qtyServer = useMutation(
    optimistic(
      ({ lineId, quantity }) =>
        quantity === 0
          ? cartApi.removeCartItem(lineId)
          : cartApi.setCartQuantity({ lineId, quantity }),
      (cart, { lineId, quantity }) => {
        cart.items =
          quantity === 0
            ? cart.items.filter((l) => l.lineId !== lineId)
            : cart.items.map((l) => (l.lineId === lineId ? { ...l, quantity } : l));
        return cart;
      },
      'Could not update cart',
    ),
  );
  const clearServer = useMutation({
    mutationFn: cartApi.clearCart,
    onSuccess: (data) => qc.setQueryData(keys.cart, data),
    onError: (err) => toast.error(toApiError(err).message),
  });
  const couponServer = useMutation({
    mutationFn: (code) => (code ? cartApi.applyCartCoupon(code) : cartApi.removeCartCoupon()),
    onSuccess: (data, code) => {
      qc.setQueryData(keys.cart, data);
      qc.invalidateQueries({ queryKey: ['checkout-preview'] });
      toast.success(code ? 'Coupon applied' : 'Coupon removed');
    },
  });

  /**
   * Add a menu item. Resolves once the optimistic update is applied; server errors roll back.
   * @param {object} item menu item
   * @param {{variantId?: string, addOnIds?: string[], quantity?: number, note?: string}} [choices]
   */
  const add = async (item, choices = {}) => {
    const line = buildLine(item, { quantity: 1, ...choices });
    if (!authed) {
      guest().add(line);
    } else {
      const payload = {
        menuItemId: item._id,
        variantId: choices.variantId,
        addOnIds: choices.addOnIds ?? [],
        quantity: line.quantity,
        note: choices.note,
      };
      await addServer.mutateAsync({ payload, line }).catch(() => {});
    }
    toast.success(`${item.name} added`);
    return line;
  };

  const setQuantity = (lineId, quantity) =>
    authed ? qtyServer.mutate({ lineId, quantity }) : guest().setQuantity(lineId, quantity);

  return {
    view,
    isLoading: authed && query.isLoading,
    isError: authed && query.isError,
    refetch: query.refetch,
    add,
    setQuantity,
    remove: (lineId) => setQuantity(lineId, 0),
    clear: () => (authed ? clearServer.mutate() : guest().clear()),
    setCoupon: (code) => couponServer.mutateAsync(code),
    couponPending: couponServer.isPending,
    itemCount: view.summary.itemCount,
  };
}

export const useCartDrawer = () => ({
  open: useUiStore((s) => s.cartOpen),
  openCart: useUiStore((s) => s.openCart),
  closeCart: useUiStore((s) => s.closeCart),
});
