import { realtime, rooms } from '../sockets/realtime.js';
import { ORDER_STATUS as S, SOCKET_EVENTS } from '../utils/constants.js';
import * as notifications from './notification.service.js';

const inr = (paise) => `Rs ${(paise / 100).toFixed(2).replace(/\.00$/, '')}`;

const STATUS_COPY = {
  [S.PLACED]: (o) => [
    'Order placed',
    `We received your order ${o.orderNumber} (${inr(o.pricing.total)}).`,
  ],
  [S.ACCEPTED]: (o) => [
    'Order accepted',
    `Order ${o.orderNumber} is confirmed. We'll start preparing it shortly.`,
  ],
  [S.PREPARING]: (o) => ['Preparing your order', `Your order ${o.orderNumber} is being prepared.`],
  [S.READY]: (o) => [
    'Order ready',
    o.type === 'pickup'
      ? `Order ${o.orderNumber} is ready for pickup.`
      : `Order ${o.orderNumber} is packed and waiting for a rider.`,
  ],
  [S.OUT_FOR_DELIVERY]: (o) => [
    'Out for delivery',
    `Order ${o.orderNumber} is on its way. You can track it live in the app.`,
  ],
  [S.DELIVERED]: (o) => ['Delivered', `Order ${o.orderNumber} was delivered. Enjoy your meal!`],
  [S.CANCELLED]: (o) => [
    'Order cancelled',
    `Order ${o.orderNumber} was cancelled.${o.cancelReason ? ` Reason: ${o.cancelReason}.` : ''}`,
  ],
  [S.REJECTED]: (o) => [
    'Order rejected',
    `Sorry, we couldn't take order ${o.orderNumber}.${o.cancelReason ? ` Reason: ${o.cancelReason}.` : ''}`,
  ],
};

/** Kitchen sees an order once it is COD or paid. */
export const isKitchenVisible = (o) => o.payment.method === 'cod' || o.payment.status === 'paid';

const summary = (o) => ({
  _id: String(o._id),
  orderNumber: o.orderNumber,
  status: o.status,
  type: o.type,
  total: o.pricing.total,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
  payment: o.payment,
  createdAt: o.createdAt,
});

/** New order that the kitchen should see: staff room gets the alert (sound/toast event). */
export function announceNewOrder(order) {
  realtime.emit(rooms.staff, SOCKET_EVENTS.ORDER_NEW, summary(order));
}

/** Status change: customer, order room and staff board all update. */
export function announceStatus(order, { notifyCustomer = true } = {}) {
  const payload = { ...summary(order), riderId: order.riderId ? String(order.riderId) : null };
  realtime.emit(
    [rooms.order(order._id), rooms.user(order.userId), rooms.staff],
    SOCKET_EVENTS.ORDER_STATUS,
    payload,
  );
  if (order.riderId) realtime.emit(rooms.user(order.riderId), SOCKET_EVENTS.ORDER_STATUS, payload);
  if (notifyCustomer && STATUS_COPY[order.status]) {
    const [title, body] = STATUS_COPY[order.status](order);
    return notifications.notify(
      order.userId,
      {
        type: 'order_status',
        title,
        body,
        data: { orderId: String(order._id), status: order.status },
      },
      { dedupeId: `order-${order._id}-${order.status}` },
    );
  }
  return undefined;
}

export function announcePayment(order) {
  realtime.emit(
    [rooms.order(order._id), rooms.user(order.userId), rooms.staff],
    SOCKET_EVENTS.ORDER_PAYMENT,
    summary(order),
  );
}

export function announceAssignment(order) {
  realtime.emit(rooms.user(order.riderId), SOCKET_EVENTS.ORDER_STATUS, {
    ...summary(order),
    assigned: true,
  });
}
