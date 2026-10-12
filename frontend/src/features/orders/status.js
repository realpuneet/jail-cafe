/** Presentation helpers for order statuses. */
export const STATUS_LABEL = {
  PLACED: 'Order placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

export const STATUS_TONE = {
  PLACED: 'warning',
  ACCEPTED: 'warning',
  PREPARING: 'warning',
  READY: 'success',
  OUT_FOR_DELIVERY: 'success',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REJECTED: 'danger',
};

/** Steps shown on the tracking timeline. Pickup orders skip "Out for delivery". */
export const timelineFor = (type) =>
  type === 'pickup'
    ? ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED']
    : ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const PICKUP_LABEL = { READY: 'Ready for pickup', DELIVERED: 'Picked up' };
export const labelFor = (status, type) =>
  (type === 'pickup' && PICKUP_LABEL[status]) || STATUS_LABEL[status] || status;

export const isClosed = (status) => ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(status);

/** Index of the current step, or -1 for cancelled/rejected. */
export const stepIndex = (status, type) => timelineFor(type).indexOf(status);

/** Needs the customer to finish paying online. */
export const needsPayment = (o) =>
  o.payment?.method === 'online' && o.payment?.status === 'pending' && o.status === 'PLACED';
