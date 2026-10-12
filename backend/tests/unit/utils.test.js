import { normalizePhone } from '../../src/utils/phone.js';
import { toSeconds } from '../../src/utils/duration.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../src/utils/pagination.js';
import { authorize } from '../../src/middlewares/auth.js';

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ])('%s -> %s', (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(['12345', '5876543210', 'abcdefghij', '', null])('rejects %p', (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );
});

describe('toSeconds', () => {
  it('parses units', () => {
    expect(toSeconds('15m')).toBe(900);
    expect(toSeconds('30d')).toBe(2592000);
    expect(toSeconds('90')).toBe(90);
    expect(() => toSeconds('abc')).toThrow();
  });
});

describe('pagination helpers', () => {
  it('clamps limit and round-trips cursors', () => {
    expect(parseLimit('1000')).toBe(100);
    expect(parseLimit(undefined)).toBe(20);
    const id = '65f0c0ffee0123456789abcd';
    expect(String(decodeCursor(encodeCursor(id)))).toBe(id);
    expect(() => decodeCursor('bm9wZQ')).toThrow(/Invalid cursor/);
  });
});

describe('authorize (RBAC)', () => {
  const run = (user, ...roles) => {
    let err;
    authorize(...roles)({ user }, {}, (e) => (err = e));
    return err;
  };
  it('allows listed roles, rejects others and anonymous', () => {
    expect(run({ role: 'admin' }, 'admin', 'staff')).toBeUndefined();
    expect(run({ role: 'customer' }, 'admin')).toMatchObject({ statusCode: 403 });
    expect(run(undefined, 'admin')).toMatchObject({ statusCode: 401 });
  });
});
