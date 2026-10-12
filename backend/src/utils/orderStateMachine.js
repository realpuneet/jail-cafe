import { ApiError } from './ApiError.js';
import { ORDER_STATUS as S, ORDER_TYPE, ROLES } from './constants.js';

/** Allowed transitions. Terminal states have none. */
export const TRANSITIONS = Object.freeze({
  [S.PLACED]: [S.ACCEPTED, S.REJECTED, S.CANCELLED],
  [S.ACCEPTED]: [S.PREPARING, S.CANCELLED],
  [S.PREPARING]: [S.READY, S.CANCELLED],
  [S.READY]: [S.OUT_FOR_DELIVERY, S.DELIVERED, S.CANCELLED],
  [S.OUT_FOR_DELIVERY]: [S.DELIVERED],
  [S.DELIVERED]: [],
  [S.CANCELLED]: [],
  [S.REJECTED]: [],
});

/** Who may perform which target status. Customers: cancel only, and only while PLACED. */
const ACTOR_TARGETS = Object.freeze({
  [ROLES.ADMIN]: Object.values(S),
  [ROLES.STAFF]: Object.values(S),
  [ROLES.RIDER]: [S.DELIVERED],
  [ROLES.CUSTOMER]: [S.CANCELLED],
});

/**
 * Validate a transition; throws ApiError (409 for illegal transitions, 403 for wrong actor).
 * @param {{status: string, type: string}} order
 * @param {string} to target status
 * @param {string} role actor role
 */
export function assertTransition(order, to, role) {
  const from = order.status;
  if (!TRANSITIONS[from]?.includes(to)) {
    throw ApiError.conflict(`Cannot move order from ${from} to ${to}`);
  }
  if (!ACTOR_TARGETS[role]?.includes(to)) throw ApiError.forbidden();
  if (role === ROLES.CUSTOMER && from !== S.PLACED) {
    throw ApiError.conflict('Order can only be cancelled before the restaurant accepts it');
  }
  if (to === S.OUT_FOR_DELIVERY && order.type !== ORDER_TYPE.DELIVERY) {
    throw ApiError.conflict('Pickup orders cannot go out for delivery');
  }
  if (to === S.DELIVERED && from === S.READY && order.type === ORDER_TYPE.DELIVERY) {
    throw ApiError.conflict('Delivery orders must go out for delivery first');
  }
  if (role === ROLES.RIDER && from !== S.OUT_FOR_DELIVERY) throw ApiError.forbidden();
}

export const isTerminal = (status) => TRANSITIONS[status]?.length === 0;
