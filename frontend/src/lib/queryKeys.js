/** Central query keys so invalidation never drifts. */
export const keys = {
  categories: ['categories'],
  menu: ['menu'],
  banners: (position) => ['banners', position ?? 'all'],
  coupons: ['coupons', 'public'],
  cart: ['cart'],
  addresses: ['addresses'],
  me: ['me'],
  orders: ['orders'],
  order: (id) => ['order', id],
  notifications: ['notifications'],
  unread: ['notifications', 'unread'],
  checkoutPreview: (params) => ['checkout-preview', params],
};
