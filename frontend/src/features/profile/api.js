import { api, unwrap } from '../../lib/axios.js';

export const fetchAddresses = () => api.get('/addresses').then(unwrap);
export const createAddress = (body) => api.post('/addresses', body).then(unwrap);
export const updateAddress = ({ id, ...body }) => api.patch(`/addresses/${id}`, body).then(unwrap);
export const deleteAddress = (id) => api.delete(`/addresses/${id}`).then(unwrap);
export const setDefaultAddress = (id) => api.put(`/addresses/${id}/default`).then(unwrap);
