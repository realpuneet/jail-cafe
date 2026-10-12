import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import addressRoutes from './address.routes.js';
import uploadRoutes from './upload.routes.js';

/** Versioned API router (mounted at API_PREFIX). Feature routers are registered per phase. */
export function apiRouter() {
  const router = Router();
  router.use('/auth', authRoutes);
  router.use('/users', userRoutes);
  router.use('/addresses', addressRoutes);
  router.use('/uploads', uploadRoutes);
  return router;
}
