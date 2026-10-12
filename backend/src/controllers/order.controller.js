import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as cartService from '../services/cart.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as notificationService from '../services/notification.service.js';
import { ORDER_STATUS } from '../utils/constants.js';

const page = (res, { items, meta }) => ApiResponse.ok(res, items, 'OK', meta);

export const cart = {
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await cartService.getCart(req.user.id)),
  ),
  add: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await cartService.addItem(req.user.id, req.body), 'Added to cart'),
  ),
  setQuantity: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await cartService.setQuantity(req.user.id, req.params.lineId, req.body.quantity),
      'Cart updated',
    ),
  ),
  remove: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await cartService.setQuantity(req.user.id, req.params.lineId, 0),
      'Removed from cart',
    ),
  ),
  clear: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await cartService.clear(req.user.id), 'Cart cleared'),
  ),
  setCoupon: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await cartService.setCoupon(req.user.id, req.body.code), 'Coupon applied'),
  ),
  clearCoupon: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await cartService.clearCoupon(req.user.id), 'Coupon removed'),
  ),
};

export const order = {
  preview: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await orderService.preview(req.user.id, req.body)),
  ),
  place: asyncHandler(async (req, res) => {
    const { order: o, replayed } = await orderService.placeOrder(
      req.user.id,
      req.body,
      req.idempotencyKey,
    );
    return replayed
      ? ApiResponse.ok(res, o, 'Order already placed')
      : ApiResponse.created(res, o, 'Order placed');
  }),
  mine: asyncHandler(async (req, res) =>
    page(res, await orderService.listMine(req.user.id, req.query)),
  ),
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await orderService.getForActor(req.params.id, req.user)),
  ),
  cancel: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await orderService.updateStatus(req.params.id, ORDER_STATUS.CANCELLED, req.user, {
        note: req.body.reason,
      }),
      'Order cancelled',
    ),
  ),
  listStaff: asyncHandler(async (req, res) =>
    page(res, await orderService.listForStaff(req.query)),
  ),
  riderMine: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await orderService.listForRider(req.user.id)),
  ),
  setStatus: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await orderService.updateStatus(req.params.id, req.body.status, req.user, {
        note: req.body.note,
      }),
      'Status updated',
    ),
  ),
  assign: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await orderService.assignRider(req.params.id, req.body.riderId),
      'Rider assigned',
    ),
  ),
};

export const payment = {
  createGatewayOrder: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await paymentService.createGatewayOrder(req.user.id, req.body.orderId),
      'Payment order ready',
    ),
  ),
  verify: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await paymentService.verifyCheckout(req.user.id, req.body),
      'Payment verified',
    ),
  ),
  webhook: asyncHandler(async (req, res) => {
    const result = await paymentService.handleWebhook(req.body, {
      signature: req.headers['x-razorpay-signature'],
      eventId: req.headers['x-razorpay-event-id'],
    });
    res.status(200).json({
      success: true,
      message: result.duplicate ? 'Duplicate ignored' : 'Processed',
      data: null,
      meta: null,
    });
  }),
};

export const notification = {
  list: asyncHandler(async (req, res) =>
    page(res, await notificationService.list(req.user.id, req.query)),
  ),
  unread: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, { count: await notificationService.unreadCount(req.user.id) }),
  ),
  read: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await notificationService.markRead(req.user.id, req.body.ids),
      'Marked as read',
    ),
  ),
};
