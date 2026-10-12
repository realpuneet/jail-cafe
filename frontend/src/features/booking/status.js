export const BOOKING_LABEL = {
  HELD: 'Awaiting deposit',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
};
export const BOOKING_TONE = {
  HELD: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  NO_SHOW: 'danger',
};
export const isLive = (b) => b.status === 'HELD' || b.status === 'CONFIRMED';
