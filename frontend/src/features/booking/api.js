import { api, unwrap, unwrapWithMeta } from '../../lib/axios.js';

export const fetchSlots = (date) =>
  api.get('/booking-slots/availability', { params: { date } }).then(unwrap);
export const createBooking = (body, idempotencyKey) =>
  api
    .post('/table-bookings', body, { headers: { 'Idempotency-Key': idempotencyKey } })
    .then(unwrap);
export const fetchBookings = ({ cursor } = {}) =>
  api.get('/table-bookings', { params: { cursor, limit: 15 } }).then(unwrapWithMeta);
export const fetchBooking = (id) => api.get(`/table-bookings/${id}`).then(unwrap);
export const cancelBooking = (id, reason) =>
  api.post(`/table-bookings/${id}/cancel`, { reason }).then(unwrap);
export const startDeposit = (id, idempotencyKey) =>
  api
    .post(`/table-bookings/${id}/pay`, {}, { headers: { 'Idempotency-Key': idempotencyKey } })
    .then(unwrap);
