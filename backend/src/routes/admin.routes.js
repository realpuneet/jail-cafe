import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { publicCache } from '../middlewares/publicCache.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { cursorQuery, idParams } from '../validators/common.js';
import * as v from '../validators/admin.validator.js';

const { ADMIN, STAFF, CUSTOMER } = ROLES;
const admin = [authenticate, authorize(ADMIN)];

export const adminRoutes = Router();
adminRoutes.get(
  '/analytics/dashboard',
  ...admin,
  validate({ query: v.dashboardQuery }),
  c.dashboard,
);
adminRoutes.get('/settings', authenticate, authorize(ADMIN, STAFF), c.getSettings);
adminRoutes.put('/settings', ...admin, validate({ body: v.settingsBody }), c.updateSettings);

export const settingsRoutes = Router();
settingsRoutes.get('/', publicCache(30, 60), c.getSettings);

export const reviewRoutes = Router();
reviewRoutes.get('/', publicCache(30, 120), validate({ query: cursorQuery }), c.review.list);
reviewRoutes.get('/summary', publicCache(60, 300), c.review.summary);
reviewRoutes.get('/manage', ...admin, validate({ query: v.adminReviewsQuery }), c.review.listAdmin);
reviewRoutes.post(
  '/',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.createReviewBody }),
  c.review.create,
);
reviewRoutes.get(
  '/order/:orderId',
  authenticate,
  authorize(CUSTOMER),
  validate({ params: v.orderIdParams }),
  c.review.forOrder,
);
reviewRoutes.patch(
  '/:id/status',
  ...admin,
  validate({ params: idParams, body: v.reviewStatusBody }),
  c.review.setStatus,
);
