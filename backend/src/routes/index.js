import { Router } from 'express';

/**
 * Versioned API router (mounted at API_PREFIX). Feature routers are registered here per phase.
 */
export function apiRouter() {
  const router = Router();
  // Phase 1+: router.use('/auth', authRoutes); router.use('/users', userRoutes); ...
  return router;
}
