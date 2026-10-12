import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Liveness (/health) and readiness (/ready) probes, mounted at the app root (not versioned).
 * @param {{readinessChecks: Record<string, () => Promise<boolean>|boolean>, state: {shuttingDown: boolean}}} deps
 */
export function healthRoutes({ readinessChecks, state }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      message: 'OK',
      data: { status: 'up', uptime: process.uptime() },
      meta: null,
    });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const checks = {};
      for (const [name, check] of Object.entries(readinessChecks)) {
        try {
          checks[name] = Boolean(await check());
        } catch {
          checks[name] = false;
        }
      }
      const ready = !state.shuttingDown && Object.values(checks).every(Boolean);
      res.status(ready ? 200 : 503).json({
        success: ready,
        message: ready ? 'Ready' : 'Not ready',
        data: { checks, shuttingDown: state.shuttingDown },
        meta: null,
      });
    }),
  );

  return router;
}
