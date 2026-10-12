import { formatPhone, formatPrice } from '../format.js';
import { ikSrcSet, ikUrl, isImageKitUrl } from '../imagekit.js';
import { toApiError, fieldError } from '../apiError.js';
import { distanceKm } from '../geo.js';

describe('formatPrice', () => {
  it('formats paise as rupees, dropping .00', () => {
    expect(formatPrice(15000)).toBe('₹150');
    expect(formatPrice(15050)).toBe('₹150.50');
    expect(formatPrice(0)).toBe('₹0');
    expect(formatPrice(undefined)).toBe('₹0');
    expect(formatPrice(12345678)).toBe('₹1,23,456.78');
  });
  it('formats phones', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('123')).toBe('123');
  });
});

describe('imagekit helpers', () => {
  const url = 'https://ik.imagekit.io/abc/jailkichai/menu/chai.jpg';
  it('adds width, quality and auto format', () => {
    expect(ikUrl(url, { width: 480 })).toBe(`${url}?tr=w-480%2Cq-75%2Cf-auto`);
  });
  it('leaves non-ImageKit urls alone', () => {
    expect(ikUrl('https://example.com/a.jpg', { width: 200 })).toBe('https://example.com/a.jpg');
    expect(ikSrcSet('https://example.com/a.jpg')).toBeUndefined();
    expect(isImageKitUrl(undefined)).toBe(false);
  });
  it('builds a srcset with a descriptor per width', () => {
    const set = ikSrcSet(url, [320, 640]);
    expect(set.split(', ')).toHaveLength(2);
    expect(set).toMatch(/w-320.* 320w, .*w-640.* 640w/);
  });
});

describe('toApiError', () => {
  it('reads the API envelope', () => {
    const err = {
      response: {
        status: 422,
        data: {
          message: 'Bad',
          code: 'VALIDATION_ERROR',
          details: [{ path: 'pincode', message: 'Invalid' }],
        },
      },
    };
    const e = toApiError(err);
    expect(e).toMatchObject({ message: 'Bad', code: 'VALIDATION_ERROR', status: 422 });
    expect(fieldError(e.details, 'pincode')).toBe('Invalid');
    expect(fieldError(undefined, 'x')).toBeUndefined();
  });
  it('explains network failures and timeouts', () => {
    expect(toApiError({ request: {}, message: 'Network Error' }).code).toBe('NETWORK');
    expect(toApiError({ code: 'ECONNABORTED' }).code).toBe('TIMEOUT');
  });
});

describe('distanceKm', () => {
  it('is ~111 km per degree of latitude', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 0);
  });
});
