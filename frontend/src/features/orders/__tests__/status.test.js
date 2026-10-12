import { isClosed, labelFor, needsPayment, stepIndex, timelineFor } from '../status.js';

describe('order status helpers', () => {
  it('pickup skips out-for-delivery and relabels READY/DELIVERED', () => {
    expect(timelineFor('pickup')).not.toContain('OUT_FOR_DELIVERY');
    expect(timelineFor('delivery')).toContain('OUT_FOR_DELIVERY');
    expect(labelFor('READY', 'pickup')).toBe('Ready for pickup');
    expect(labelFor('READY', 'delivery')).toBe('Ready');
  });
  it('computes step index and closed states', () => {
    expect(stepIndex('PREPARING', 'delivery')).toBe(2);
    expect(stepIndex('CANCELLED', 'delivery')).toBe(-1);
    expect(isClosed('DELIVERED')).toBe(true);
    expect(isClosed('PREPARING')).toBe(false);
  });
  it('detects orders waiting for online payment', () => {
    expect(
      needsPayment({ status: 'PLACED', payment: { method: 'online', status: 'pending' } }),
    ).toBe(true);
    expect(
      needsPayment({ status: 'PLACED', payment: { method: 'cod', status: 'cod_pending' } }),
    ).toBe(false);
    expect(
      needsPayment({ status: 'CANCELLED', payment: { method: 'online', status: 'pending' } }),
    ).toBe(false);
  });
});
