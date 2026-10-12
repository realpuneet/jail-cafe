import { api, unwrap, unwrapWithMeta } from '../../lib/axios.js';

export const fetchPackages = (type) =>
  api.get('/party-packages', { params: { type } }).then(unwrap);
export const createInquiry = (body, key) =>
  api.post('/party-inquiries', body, { headers: { 'Idempotency-Key': key } }).then(unwrap);
export const fetchInquiries = ({ cursor } = {}) =>
  api.get('/party-inquiries', { params: { cursor, limit: 15 } }).then(unwrapWithMeta);
export const fetchInquiry = (id) => api.get(`/party-inquiries/${id}`).then(unwrap);
export const acceptQuote = (id) => api.post(`/party-inquiries/${id}/accept`).then(unwrap);
export const declineQuote = (id) => api.post(`/party-inquiries/${id}/decline`).then(unwrap);
export const cancelInquiry = (id, reason) =>
  api.post(`/party-inquiries/${id}/cancel`, { reason }).then(unwrap);
export const startTokenPayment = (id, key) =>
  api.post(`/party-inquiries/${id}/pay`, {}, { headers: { 'Idempotency-Key': key } }).then(unwrap);
