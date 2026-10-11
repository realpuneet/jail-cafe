import { ZodError, z } from 'zod';
import { normalizeError } from '../../src/middlewares/errorHandler.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('normalizeError', () => {
  it('passes ApiError through', () => {
    const e = ApiError.notFound('x');
    expect(normalizeError(e)).toBe(e);
  });

  it('maps ZodError to 422 with field details', () => {
    const r = z.object({ phone: z.string().min(10) }).safeParse({ phone: '1' });
    const e = normalizeError(new ZodError(r.error.issues));
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details[0].path).toBe('phone');
  });

  it('maps mongoose ValidationError, CastError and duplicate key', () => {
    expect(
      normalizeError({ name: 'ValidationError', errors: { a: { path: 'a', message: 'bad' } } })
        .statusCode,
    ).toBe(422);
    expect(normalizeError({ name: 'CastError', path: '_id' }).statusCode).toBe(400);
    const dup = normalizeError({ code: 11000, keyPattern: { phone: 1 } });
    expect(dup.statusCode).toBe(409);
    expect(dup.details[0].path).toBe('phone');
  });

  it('maps JWT errors to 401 with distinct codes', () => {
    expect(normalizeError({ name: 'TokenExpiredError' }).code).toBe('TOKEN_EXPIRED');
    expect(normalizeError({ name: 'JsonWebTokenError' }).code).toBe('TOKEN_INVALID');
  });

  it('maps Razorpay errors and hides unknown errors', () => {
    const rz = normalizeError({ statusCode: 400, error: { description: 'Bad amount' } });
    expect(rz.code).toBe('PAYMENT_ERROR');
    expect(rz.message).toBe('Bad amount');
    const unknown = normalizeError(new Error('db password is hunter2'));
    expect(unknown.statusCode).toBe(500);
    expect(unknown.message).toBe('Internal server error');
  });
});
