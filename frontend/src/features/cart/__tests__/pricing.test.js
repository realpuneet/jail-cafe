import { buildLine, emptyCart, lineKey, recalcCart, unitPriceFor } from '../pricing.js';

const burger = {
  _id: 'm1',
  name: 'Burger',
  isVeg: false,
  price: 10000,
  variants: [
    { _id: 'v1', name: 'Regular', price: 10000 },
    { _id: 'v2', name: 'Large', price: 15000 },
  ],
  addOns: [
    { _id: 'a1', name: 'Cheese', price: 2500 },
    { _id: 'a2', name: 'Sauce', price: 500 },
  ],
};

describe('cart pricing helpers', () => {
  it('prices variant + add-ons', () => {
    expect(unitPriceFor(burger, 'v2', ['a1', 'a2'])).toBe(18000);
    expect(unitPriceFor(burger, undefined, [])).toBe(10000);
  });

  it('lineKey ignores add-on order and matches server-shaped lines', () => {
    const a = lineKey({ menuItemId: 'm1', variantId: 'v1', addOnIds: ['a2', 'a1'] });
    const b = lineKey({
      menuItemId: 'm1',
      variantId: 'v1',
      addOns: [{ addOnId: 'a1' }, { addOnId: 'a2' }],
    });
    expect(a).toBe(b);
    expect(a).not.toBe(lineKey({ menuItemId: 'm1', variantId: 'v2', addOnIds: ['a1', 'a2'] }));
    expect(a).not.toBe(
      lineKey({ menuItemId: 'm1', variantId: 'v1', addOnIds: ['a1', 'a2'], note: 'x' }),
    );
  });

  it('buildLine snapshots display data', () => {
    const l = buildLine(burger, { variantId: 'v2', addOnIds: ['a1'], quantity: 2 });
    expect(l).toMatchObject({
      name: 'Burger',
      variantName: 'Large',
      unitPrice: 17500,
      quantity: 2,
    });
    expect(l.addOns).toEqual([{ addOnId: 'a1', name: 'Cheese', price: 2500 }]);
  });

  it('recalcCart recomputes totals and skips unavailable lines', () => {
    const view = {
      ...emptyCart(),
      items: [
        { lineId: 'a', unitPrice: 2000, quantity: 3 },
        { lineId: 'b', unitPrice: 9999, quantity: 1, issue: 'out_of_stock' },
      ],
      coupon: { code: 'X', discount: 1000 },
    };
    const out = recalcCart(view);
    expect(out.summary).toMatchObject({
      itemCount: 4,
      subtotal: 6000,
      discount: 1000,
      total: 5000,
    });
    expect(out.items[0].lineTotal).toBe(6000);
  });

  it('caps the discount at the subtotal', () => {
    const out = recalcCart({
      ...emptyCart(),
      items: [{ lineId: 'a', unitPrice: 1000, quantity: 1 }],
      coupon: { code: 'X', discount: 99999 },
    });
    expect(out.summary.total).toBe(0);
  });
});
