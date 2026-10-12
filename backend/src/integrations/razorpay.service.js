import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let client;
const getClient = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Online payments are not configured');
  }
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
};

/** Thin wrapper around the SDK. A mutable object so tests can stub the network calls. */
export const razorpayService = {
  keyId: () => env.RAZORPAY_KEY_ID,

  /**
   * @param {{amount: number, receipt: string, notes?: Record<string,string>}} p amount in paise
   */
  createOrder({ amount, receipt, notes }) {
    return getClient().orders.create({ amount, currency: 'INR', receipt, notes });
  },

  /** @param {string} paymentId @param {{amount: number, notes?: object}} p */
  refund(paymentId, { amount, notes }) {
    return getClient().payments.refund(paymentId, { amount, notes, speed: 'normal' });
  },
};
