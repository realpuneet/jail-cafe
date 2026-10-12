import { api, unwrap } from '../../lib/axios.js';

export const fetchCart = () => api.get('/cart').then(unwrap);
export const addCartItem = (body) => api.post('/cart/items', body).then(unwrap);
export const setCartQuantity = ({ lineId, quantity }) =>
  api.patch(`/cart/items/${lineId}`, { quantity }).then(unwrap);
export const removeCartItem = (lineId) => api.delete(`/cart/items/${lineId}`).then(unwrap);
export const clearCart = () => api.delete('/cart').then(unwrap);
export const applyCartCoupon = (code) => api.put('/cart/coupon', { code }).then(unwrap);
export const removeCartCoupon = () => api.delete('/cart/coupon').then(unwrap);
