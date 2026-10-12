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
  slots: (date) => ['slots', date],
  bookings: ['bookings'],
  booking: (id) => ['booking', id],
  unread: ['notifications', 'unread'],
  checkoutPreview: (params) => ['checkout-preview', params],
};
