import { env } from '../../lib/env.js';
import { loadRazorpay } from '../../lib/razorpay.js';
import { newIdempotencyKey } from '../../lib/id.js';
import { createGatewayOrder, verifyPayment } from './api.js';

/**
 * Open Razorpay Checkout for an unpaid online order and verify the result on the server.
 * Resolves `{ status: 'paid' }` or `{ status: 'dismissed' }`; rejects on payment/network errors.
 * @param {{_id: string}} order
 * @param {{name?: string, phone?: string, email?: string}} [prefill]
 */
export async function payForOrder(order, prefill = {}) {
  const [Razorpay, gateway] = await Promise.all([
    loadRazorpay(),
    createGatewayOrder(order._id, newIdempotencyKey()),
  ]);

  return new Promise((resolve, reject) => {
    const instance = new Razorpay({
      key: gateway.keyId || env.razorpayKeyId,
      amount: gateway.amount,
      currency: gateway.currency,
      name: gateway.name,
      description: `Order ${gateway.orderNumber}`,
      order_id: gateway.razorpayOrderId,
      prefill: { name: prefill.name, contact: prefill.phone, email: prefill.email },
      theme: { color: '#8f5522' },
      handler: async (response) => {
        try {
          await verifyPayment(response);
          resolve({ status: 'paid' });
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => resolve({ status: 'dismissed' }) },
    });
    instance.on?.('payment.failed', (res) =>
      reject(new Error(res?.error?.description || 'Payment failed')),
    );
    instance.open();
  });
}
