import { api, unwrap, unwrapWithMeta } from '../../lib/axios.js';

export const previewOrder = (body) => api.post('/orders/preview', body).then(unwrap);
export const placeOrder = (body, idempotencyKey) =>
  api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }).then(unwrap);
export const fetchOrders = ({ cursor, limit = 15 } = {}) =>
  api.get('/orders', { params: { cursor, limit } }).then(unwrapWithMeta);
export const fetchOrder = (id) => api.get(`/orders/${id}`).then(unwrap);
export const cancelOrder = (id, reason) =>
  api.post(`/orders/${id}/cancel`, { reason }).then(unwrap);
export const createGatewayOrder = (orderId, idempotencyKey) =>
  api
    .post(
      '/payments/razorpay/order',
      { orderId },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    .then(unwrap);
export const verifyPayment = (body) => api.post('/payments/razorpay/verify', body).then(unwrap);
