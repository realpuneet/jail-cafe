/** Centralized enums and constants. Add new domain enums here, never inline. */

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  STAFF: 'staff',
  RIDER: 'rider',
});
export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
});

export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL_ERROR',
});

export const REQUEST_ID_HEADER = 'x-request-id';

export const TOKEN = Object.freeze({
  REFRESH_COOKIE: 'jkc_rt',
  ISSUER: 'jail-ki-chai',
  REUSE_GRACE_SECONDS: 10,
});

export const OTP = Object.freeze({
  LENGTH: 6,
  RESEND_COOLDOWN_SECONDS: 30,
  MAX_REQUESTS_PER_HOUR: 5,
  LOCK_SECONDS: 15 * 60,
});

export const LOGIN = Object.freeze({
  MAX_FAILURES: 5,
  LOCK_SECONDS: 15 * 60,
});

export const ADDRESS = Object.freeze({
  MAX_PER_USER: 10,
  LABELS: ['home', 'work', 'other'],
});

export const PAGINATION = Object.freeze({ DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

export const UPLOAD_FOLDERS = Object.freeze(['avatars', 'menu', 'banners', 'party', 'misc']);

export const CACHE_TTL = Object.freeze({
  CATALOG: 300,
  BANNERS: 120,
  ZONES: 600,
  COUPONS: 60,
});

export const BANNER_POSITIONS = Object.freeze(['home_hero', 'home_secondary', 'menu', 'party']);
export const DISCOUNT_TYPES = Object.freeze({ PERCENT: 'percent', FLAT: 'flat' });
export const ZONE_KINDS = Object.freeze({ PINCODE: 'pincode', DISTANCE: 'distance' });
export const MAX_PUBLIC_MENU_ITEMS = 500;

export const ORDER_STATUS = Object.freeze({
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
});
export const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));
export const ORDER_ACTIVE_STATUSES = Object.freeze([
  ORDER_STATUS.PLACED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
]);

export const ORDER_TYPE = Object.freeze({ DELIVERY: 'delivery', PICKUP: 'pickup' });

export const PAYMENT_METHOD = Object.freeze({ ONLINE: 'online', COD: 'cod' });
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending', // online, awaiting capture
  COD_PENDING: 'cod_pending', // cash to be collected
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});
export const PAYMENT_PURPOSE = Object.freeze({
  ORDER: 'order',
  BOOKING: 'booking',
  PARTY: 'party',
});

export const CART = Object.freeze({ MAX_LINES: 50, MAX_QTY_PER_LINE: 20, TTL_DAYS: 30 });
export const ORDER = Object.freeze({
  UNPAID_EXPIRY_MINUTES: 15,
  MAX_NOTE_LENGTH: 300,
});
export const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;

export const QUEUES = Object.freeze({
  NOTIFICATIONS: 'notifications',
  NOTIFICATIONS_DLQ: 'notifications-dlq',
  PAYMENTS: 'payments',
  MAINTENANCE: 'maintenance',
});
export const JOBS = Object.freeze({
  NOTIFY: 'notify',
  REFUND_ORDER: 'refund-order',
  EXPIRE_UNPAID_ORDERS: 'expire-unpaid-orders',
});

export const SOCKET_EVENTS = Object.freeze({
  ORDER_NEW: 'order:new',
  ORDER_STATUS: 'order:status',
  ORDER_PAYMENT: 'order:payment',
  ORDER_LOCATION: 'order:location',
  NOTIFICATION: 'notification:new',
});
