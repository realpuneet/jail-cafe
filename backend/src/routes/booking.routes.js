import { Router } from 'express';
import * as c from '../controllers/booking.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { publicCache } from '../middlewares/publicCache.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { cursorQuery, idParams } from '../validators/common.js';
import * as v from '../validators/booking.validator.js';

const { ADMIN, STAFF, CUSTOMER } = ROLES;
const admin = [authenticate, authorize(ADMIN)];
const staff = [authenticate, authorize(ADMIN, STAFF)];

export const slotRoutes = Router();
// Seat counts change by the second, so only a very short shared cache.
slotRoutes.get(
  '/availability',
  publicCache(5, 10),
  validate({ query: v.availabilityQuery }),
  c.slot.availability,
);
slotRoutes.get('/manage', ...staff, c.slot.listAdmin);
slotRoutes.post('/', ...admin, validate({ body: v.createSlotBody }), c.slot.create);
slotRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateSlotBody }),
  c.slot.update,
);
slotRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.slot.remove);

export const bookingRoutes = Router();
bookingRoutes.post(
  '/',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.createBookingBody }),
  idempotency({ required: true }),
  c.booking.create,
);
bookingRoutes.get(
  '/',
  authenticate,
  authorize(CUSTOMER),
  validate({ query: cursorQuery }),
  c.booking.mine,
);
bookingRoutes.get(
  '/manage',
  ...staff,
  validate({ query: v.staffBookingsQuery }),
  c.booking.staffList,
);
bookingRoutes.get(
  '/manage/calendar',
  ...staff,
  validate({ query: v.calendarQuery }),
  c.booking.calendar,
);
bookingRoutes.get('/:id', authenticate, validate({ params: idParams }), c.booking.get);
bookingRoutes.post(
  '/:id/pay',
  authenticate,
  authorize(CUSTOMER),
  validate({ params: idParams }),
  idempotency(),
  c.booking.pay,
);
bookingRoutes.post(
  '/:id/cancel',
  authenticate,
  validate({ params: idParams, body: v.cancelBookingBody }),
  c.booking.cancel,
);
bookingRoutes.patch(
  '/:id/outcome',
  ...staff,
  validate({ params: idParams, body: v.outcomeBody }),
  c.booking.outcome,
);
