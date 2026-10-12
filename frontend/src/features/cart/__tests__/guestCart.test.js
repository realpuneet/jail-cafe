import { vi } from 'vitest';

vi.mock('../../../lib/axios.js', () => ({ api: { post: vi.fn() }, unwrap: (r) => r.data.data }));
import { api } from '../../../lib/axios.js';
import { mergeGuestCart, useGuestCart } from '../guestCart.js';

const line = (over = {}) => ({
  lineId: 'l1',
  menuItemId: 'm1',
  quantity: 1,
  unitPrice: 2000,
  addOnIds: [],
  ...over,
});

beforeEach(() => {
  useGuestCart.getState().clear();
  vi.clearAllMocks();
});

describe('guest cart', () => {
  it('merges identical lines and caps quantity at 20', () => {
    const { add } = useGuestCart.getState();
    add(line({ quantity: 15 }));
    add(line({ lineId: 'l2', quantity: 10 }));
    const { lines } = useGuestCart.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(20);
  });

  it('keeps different variants separate; quantity 0 removes', () => {
    const s = useGuestCart.getState();
    s.add(line());
    s.add(line({ lineId: 'l2', variantId: 'v2' }));
    expect(useGuestCart.getState().lines).toHaveLength(2);
    useGuestCart.getState().setQuantity('l1', 0);
    expect(useGuestCart.getState().lines.map((l) => l.lineId)).toEqual(['l2']);
  });

  it('view() computes a server-shaped summary', () => {
    useGuestCart.getState().add(line({ quantity: 3 }));
    expect(useGuestCart.getState().view().summary).toMatchObject({
      itemCount: 3,
      subtotal: 6000,
      total: 6000,
    });
  });

  it('mergeGuestCart posts each line, survives failures and clears the cart', async () => {
    const s = useGuestCart.getState();
    s.add(line({ quantity: 2, note: 'hot' }));
    s.add(line({ lineId: 'l2', menuItemId: 'm2' }));
    api.post.mockRejectedValueOnce(new Error('sold out')).mockResolvedValue({});
    await mergeGuestCart();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledWith('/cart/items', {
      menuItemId: 'm1',
      variantId: undefined,
      addOnIds: [],
      quantity: 2,
      note: 'hot',
    });
    expect(useGuestCart.getState().lines).toHaveLength(0);
  });

  it('mergeGuestCart is a no-op for an empty cart', async () => {
    await mergeGuestCart();
    expect(api.post).not.toHaveBeenCalled();
  });
});
