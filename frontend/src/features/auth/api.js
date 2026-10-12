import { api, unwrap } from '../../lib/axios.js';

export const requestOtp = (phone) => api.post('/auth/otp/request', { phone }).then(unwrap);
export const verifyOtp = (body) => api.post('/auth/otp/verify', body).then(unwrap);
export const passwordLogin = (body) => api.post('/auth/login', body).then(unwrap);
export const logoutRequest = () => api.post('/auth/logout').then(unwrap);
export const fetchMe = () => api.get('/users/me').then(unwrap);
export const updateMe = (body) => api.patch('/users/me', body).then(unwrap);
