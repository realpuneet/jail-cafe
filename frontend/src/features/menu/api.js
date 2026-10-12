import { api, unwrap } from '../../lib/axios.js';

export const fetchCategories = () => api.get('/categories').then(unwrap);
export const fetchMenu = () => api.get('/menu-items').then(unwrap);
export const fetchMenuItem = (idOrSlug) => api.get(`/menu-items/${idOrSlug}`).then(unwrap);
export const fetchBanners = (position) =>
  api.get('/banners', { params: { position } }).then(unwrap);
export const fetchPublicCoupons = () => api.get('/coupons').then(unwrap);
