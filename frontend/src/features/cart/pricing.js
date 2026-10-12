/** Client-side price preview for UI only. The server re-prices everything at checkout. */
export function unitPriceFor(item, variantId, addOnIds = []) {
  const variant = item.variants?.find((v) => v._id === variantId);
  const base = variant ? variant.price : item.price;
  const extras = (item.addOns ?? [])
    .filter((a) => addOnIds.includes(a._id))
    .reduce((n, a) => n + a.price, 0);
  return base + extras;
}

/** Stable identity of a cart line (matches the server's merge rule closely enough for the UI). */
export const lineKey = ({ menuItemId, variantId, addOnIds, addOns, note }) => {
  const ids = addOnIds ?? addOns?.map((a) => a.addOnId) ?? [];
  return [menuItemId, variantId ?? '', [...new Set(ids)].sort().join(','), note ?? ''].join('|');
};

/** Recompute the summary of a cart view after an optimistic edit. */
export function recalcCart(view) {
  const valid = view.items.filter((l) => !l.issue);
  const subtotal = valid.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const discount = Math.min(view.coupon?.discount ?? 0, subtotal);
  return {
    ...view,
    items: view.items.map((l) => ({ ...l, lineTotal: l.unitPrice * l.quantity })),
    summary: {
      ...view.summary,
      itemCount: view.items.reduce((n, l) => n + l.quantity, 0),
      subtotal,
      discount,
      total: subtotal - discount + (view.summary?.deliveryCharge ?? 0),
    },
  };
}

export const emptyCart = () => ({
  items: [],
  coupon: null,
  hasIssues: false,
  summary: { itemCount: 0, subtotal: 0, discount: 0, deliveryCharge: 0, taxIncluded: 0, total: 0 },
});

/** Build a display line (same shape the server returns) from a menu item + choices. */
export function buildLine(item, { variantId, addOnIds = [], quantity = 1, note }) {
  const variant = item.variants?.find((v) => v._id === variantId);
  return {
    lineId: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    menuItemId: item._id,
    name: item.name,
    isVeg: item.isVeg,
    image: item.image?.thumbnailUrl ?? item.image?.url,
    variantId,
    variantName: variant?.name,
    addOnIds,
    addOns: (item.addOns ?? [])
      .filter((a) => addOnIds.includes(a._id))
      .map((a) => ({ addOnId: a._id, name: a.name, price: a.price })),
    unitPrice: unitPriceFor(item, variantId, addOnIds),
    quantity,
    note,
  };
}
