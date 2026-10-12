import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import addressRoutes from './address.routes.js';
import uploadRoutes from './upload.routes.js';
import {
  bannerRoutes,
  categoryRoutes,
  couponRoutes,
  menuRoutes,
  zoneRoutes,
} from './catalog.routes.js';
import { bookingRoutes, slotRoutes } from './booking.routes.js';
import { inquiryRoutes, packageRoutes } from './party.routes.js';
import { cartRoutes, notificationRoutes, orderRoutes, paymentRoutes } from './order.routes.js';

/** Versioned API router (mounted at API_PREFIX). Feature routers are registered per phase. */
export function apiRouter() {
  const router = Router();
  router.use('/auth', authRoutes);
  router.use('/users', userRoutes);
  router.use('/addresses', addressRoutes);
  router.use('/uploads', uploadRoutes);
  router.use('/categories', categoryRoutes);
  router.use('/menu-items', menuRoutes);
  router.use('/banners', bannerRoutes);
  router.use('/delivery-zones', zoneRoutes);
  router.use('/coupons', couponRoutes);
  router.use('/cart', cartRoutes);
  router.use('/orders', orderRoutes);
  router.use('/payments', paymentRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/booking-slots', slotRoutes);
  router.use('/table-bookings', bookingRoutes);
  router.use('/party-packages', packageRoutes);
  router.use('/party-inquiries', inquiryRoutes);
  return router;
}
