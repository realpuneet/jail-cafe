import { jest } from '@jest/globals';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { ApiError } from '../../src/utils/ApiError.js';
import { captureException, setErrorReporter } from '../../src/utils/errorTracking.js';

const res = () => {
  const r = { headersSent: false };
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

describe('error tracking hook', () => {
  afterEach(() => setErrorReporter(null));

  it('reports unexpected (5xx) errors with request context, but not client errors', () => {
    const reporter = jest.fn();
    setErrorReporter(reporter);
    errorHandler(new Error('boom'), { id: 'req-1', method: 'GET', path: '/x' }, res(), () => {});
    expect(reporter).toHaveBeenCalledWith(expect.any(Error), {
      requestId: 'req-1',
      method: 'GET',
      path: '/x',
    });
    errorHandler(
      ApiError.notFound('nope'),
      { id: 'req-2', method: 'GET', path: '/y' },
      res(),
      () => {},
    );
    errorHandler(
      ApiError.validation('bad'),
      { id: 'req-3', method: 'POST', path: '/z' },
      res(),
      () => {},
    );
    expect(reporter).toHaveBeenCalledTimes(1);
  });

  it('never lets a failing reporter break the response', () => {
    setErrorReporter(() => {
      throw new Error('sentry down');
    });
    const r = res();
    expect(() =>
      errorHandler(new Error('boom'), { id: 'r', method: 'GET', path: '/' }, r, () => {}),
    ).not.toThrow();
    expect(r.status).toHaveBeenCalledWith(500);
    expect(() => captureException(new Error('x'))).not.toThrow();
  });
});
