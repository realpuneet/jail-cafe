import { createHmac, timingSafeEqual } from 'node:crypto';

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Checkout callback signature: HMAC_SHA256(`${order_id}|${payment_id}`, key_secret).
 * @param {{orderId: string, paymentId: string, signature: string}} p
 * @param {string} keySecret
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }, keySecret) {
  if (!keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Webhook signature: HMAC_SHA256(raw request body, webhook_secret). Must use the RAW bytes.
 * @param {Buffer|string} rawBody
 * @param {string} signature value of X-Razorpay-Signature
 * @param {string} webhookSecret
 */
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret || !signature) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
