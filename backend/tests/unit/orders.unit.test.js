import { computeTotals, taxIncluded } from '../../src/services/pricing.service.js';
import { assertTransition, isTerminal, TRANSITIONS } from '../../src/utils/orderStateMachine.js';
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../../src/utils/razorpaySignature.js';
import { createHmac } from 'node:crypto';

describe('order state machine', () => {
  const o = (status, type = 'delivery') => ({ status, type });

  it('allows the happy path for staff and rejects skipping steps', () => {
    expect(() => assertTransition(o('PLACED'), 'ACCEPTED', 'staff')).not.toThrow();
    expect(() => assertTransition(o('ACCEPTED'), 'PREPARING', 'staff')).not.toThrow();
    expect(() => assertTransition(o('PLACED'), 'READY', 'staff')).toThrow(/Cannot move/);
    expect(() => assertTransition(o('DELIVERED'), 'CANCELLED', 'admin')).toThrow(/Cannot move/);
  });

  it('terminal states have no exits', () => {
    for (const s of ['DELIVERED', 'CANCELLED', 'REJECTED']) {
      expect(isTerminal(s)).toBe(true);
      expect(TRANSITIONS[s]).toEqual([]);
    }
  });

  it('customers can cancel only while PLACED; riders only deliver', () => {
    expect(() => assertTransition(o('PLACED'), 'CANCELLED', 'customer')).not.toThrow();
    expect(() => assertTransition(o('ACCEPTED'), 'CANCELLED', 'customer')).toThrow(
      /before the restaurant accepts/,
    );
    expect(() => assertTransition(o('PLACED'), 'ACCEPTED', 'customer')).toThrow();
    expect(() => assertTransition(o('OUT_FOR_DELIVERY'), 'DELIVERED', 'rider')).not.toThrow();
    expect(() => assertTransition(o('READY'), 'OUT_FOR_DELIVERY', 'rider')).toThrow();
  });

  it('pickup orders skip delivery; delivery orders cannot skip OUT_FOR_DELIVERY', () => {
    expect(() => assertTransition(o('READY', 'pickup'), 'DELIVERED', 'staff')).not.toThrow();
    expect(() => assertTransition(o('READY', 'pickup'), 'OUT_FOR_DELIVERY', 'staff')).toThrow(
      /Pickup/,
    );
    expect(() => assertTransition(o('READY', 'delivery'), 'DELIVERED', 'staff')).toThrow(
      /go out for delivery/,
    );
  });
});

describe('pricing math', () => {
  it('extracts GST from inclusive prices', () => {
    expect(taxIncluded(10500, 5)).toBe(500);
    expect(taxIncluded(1000, 0)).toBe(0);
  });
  it('computes totals, caps the discount and scales tax', () => {
    const lines = [
      { lineTotal: 10000, taxIncluded: 476 },
      { lineTotal: 10000, taxIncluded: 476 },
    ];
    expect(computeTotals({ lines, discount: 5000, deliveryCharge: 3000 })).toEqual({
      subtotal: 20000,
      discount: 5000,
      deliveryCharge: 3000,
      taxIncluded: 714,
      total: 18000,
    });
    expect(computeTotals({ lines, discount: 999999 }).total).toBe(0);
    expect(computeTotals({ lines: [] }).total).toBe(0);
  });
});

describe('razorpay signatures', () => {
  const secret = 'shh';
  it('verifies checkout and webhook HMACs and rejects tampering', () => {
    const sig = createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
    expect(
      verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }, secret),
    ).toBe(true);
    expect(
      verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }, secret),
    ).toBe(false);
    expect(
      verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'x' }, secret),
    ).toBe(false);
    expect(
      verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }, ''),
    ).toBe(false);

    const body = Buffer.from('{"event":"payment.captured"}');
    const wsig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, wsig, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), wsig, secret)).toBe(
      false,
    );
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });
});
