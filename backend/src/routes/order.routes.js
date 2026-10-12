import { Router } from 'express';
import * as c from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { cursorQuery, idParams } from '../validators/common.js';
import * as v from '../validators/order.validator.js';

const { ADMIN, STAFF, RIDER, CUSTOMER } = ROLES;
const staff = [authenticate, authorize(ADMIN, STAFF)];

export const cartRoutes = Router();
cartRoutes.use(authenticate, authorize(CUSTOMER));
cartRoutes.get('/', c.cart.get);
cartRoutes.delete('/', c.cart.clear);
cartRoutes.post('/items', validate({ body: v.addCartItemBody }), c.cart.add);
cartRoutes.patch(
  '/items/:lineId',
  validate({ params: v.cartLineParams, body: v.cartQuantityBody }),
  c.cart.setQuantity,
);
cartRoutes.delete('/items/:lineId', validate({ params: v.cartLineParams }), c.cart.remove);
cartRoutes.put('/coupon', validate({ body: v.cartCouponBody }), c.cart.setCoupon);
cartRoutes.delete('/coupon', c.cart.clearCoupon);

export const orderRoutes = Router();
orderRoutes.post(
  '/preview',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.previewBody }),
  c.order.preview,
);
orderRoutes.post(
  '/',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.placeOrderBody }),
  idempotency({ required: true }),
  c.order.place,
);
orderRoutes.get(
  '/',
  authenticate,
  authorize(CUSTOMER),
  validate({ query: cursorQuery }),
  c.order.mine,
);
orderRoutes.get('/manage', ...staff, validate({ query: v.staffOrdersQuery }), c.order.listStaff);
orderRoutes.get('/rider/mine', authenticate, authorize(RIDER), c.order.riderMine);
orderRoutes.get('/:id', authenticate, validate({ params: idParams }), c.order.get);
orderRoutes.post(
  '/:id/cancel',
  authenticate,
  authorize(CUSTOMER),
  validate({ params: idParams, body: v.cancelBody }),
  c.order.cancel,
);
orderRoutes.patch(
  '/:id/status',
  authenticate,
  authorize(ADMIN, STAFF, RIDER),
  validate({ params: idParams, body: v.statusBody }),
  c.order.setStatus,
);
orderRoutes.patch(
  '/:id/assign',
  ...staff,
  validate({ params: idParams, body: v.assignBody }),
  c.order.assign,
);

export const paymentRoutes = Router();
paymentRoutes.post(
  '/razorpay/order',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.createGatewayOrderBody }),
  idempotency(),
  c.payment.createGatewayOrder,
);
paymentRoutes.post(
  '/razorpay/verify',
  authenticate,
  authorize(CUSTOMER),
  validate({ body: v.verifyPaymentBody }),
  c.payment.verify,
);
// The webhook route is wired in app.js (raw body parser must run before express.json).
export const webhookHandler = c.payment.webhook;

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);
notificationRoutes.get('/', validate({ query: cursorQuery }), c.notification.list);
notificationRoutes.get('/unread-count', c.notification.unread);
notificationRoutes.post('/read', validate({ body: v.markReadBody }), c.notification.read);
