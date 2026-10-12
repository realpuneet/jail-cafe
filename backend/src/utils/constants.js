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
