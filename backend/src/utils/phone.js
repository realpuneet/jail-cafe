const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalize an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if invalid.
 * @param {string} input
 * @returns {string|null}
 */
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/[\s()-]/g, '');
  const local = digits.replace(/^(\+?91|0)(?=\d{10}$)/, '');
  return INDIAN_MOBILE.test(local) ? `+91${local}` : null;
}
