export const PARTY_LABEL = {
  SUBMITTED: 'Inquiry sent',
  QUOTED: 'Quote received',
  ACCEPTED: 'Awaiting token',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
};
export const PARTY_TONE = {
  SUBMITTED: 'neutral',
  QUOTED: 'warning',
  ACCEPTED: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  DECLINED: 'danger',
  CLOSED: 'danger',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
};

/** Happy-path steps for the progress timeline. */
export const PARTY_STEPS = ['SUBMITTED', 'QUOTED', 'ACCEPTED', 'CONFIRMED'];
export const STEP_TEXT = {
  SUBMITTED: 'You sent the inquiry',
  QUOTED: 'We sent you a quote',
  ACCEPTED: 'You accepted, date reserved',
  CONFIRMED: 'Token paid, party confirmed',
};
export const EVENT_TYPES = [
  ['birthday', 'Birthday'],
  ['kitty', 'Kitty party'],
  ['anniversary', 'Anniversary'],
  ['corporate', 'Corporate'],
  ['other', 'Something else'],
];
export const isOpen = (s) => ['SUBMITTED', 'QUOTED', 'ACCEPTED'].includes(s);
