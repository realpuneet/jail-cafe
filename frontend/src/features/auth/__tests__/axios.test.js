import axios from 'axios';

// Route table for a fake network layer. Set before lib/axios.js is imported so that both the
// app instance and the interceptor-free "bare" refresh instance use it.
const routes = new Map();
const calls = [];
axios.defaults.adapter = (config) => {
  const key = `${config.method.toUpperCase()} ${config.url}`;
  calls.push(key);
  const handler = routes.get(key);
  if (!handler) return Promise.reject(new Error(`unmocked ${key}`));
  const [status, data] = handler(config);
  const response = { data, status, statusText: '', headers: {}, config, request: {} };
  return status >= 200 && status < 300
    ? Promise.resolve(response)
    : Promise.reject(new axios.AxiosError('failed', null, config, {}, response));
};
const on = (method, url, fn) => routes.set(`${method} ${url}`, fn);
const auth = (config) => config.headers.get?.('Authorization') ?? config.headers.Authorization;

const { api, refreshSession } = await import('../../../lib/axios.js');
const { useAuthStore } = await import('../authStore.js');

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  useAuthStore.setState({ status: 'authenticated', accessToken: 'old', user: { _id: 'u1' } });
});

describe('axios auth handling', () => {
  it('attaches the bearer token', async () => {
    on('GET', '/ping', (config) => {
      expect(auth(config)).toBe('Bearer old');
      return [200, { data: 'pong' }];
    });
    await api.get('/ping');
  });

  it('refreshes once on 401, retries the request, and shares one refresh between concurrent calls', async () => {
    on('POST', '/auth/refresh', () => [
      200,
      { data: { accessToken: 'new', user: { _id: 'u1', name: 'A' } } },
    ]);
    on('GET', '/secure', (config) =>
      auth(config) === 'Bearer new' ? [200, { data: 'ok' }] : [401, { code: 'TOKEN_EXPIRED' }],
    );

    const [a, b] = await Promise.all([api.get('/secure'), api.get('/secure')]);
    expect(a.data.data).toBe('ok');
    expect(b.data.data).toBe('ok');
    expect(calls.filter((c) => c === 'POST /auth/refresh')).toHaveLength(1);
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('clears the session when refresh fails and surfaces the original 401', async () => {
    on('POST', '/auth/refresh', () => [401, { message: 'no' }]);
    on('GET', '/secure', () => [401, { code: 'TOKEN_EXPIRED' }]);
    await expect(api.get('/secure')).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('does not try to refresh for /auth/* endpoints', async () => {
    on('POST', '/auth/otp/verify', () => [401, { message: 'bad otp' }]);
    await expect(api.post('/auth/otp/verify', {})).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(calls).toEqual(['POST /auth/otp/verify']);
  });

  it('retries a request at most once', async () => {
    on('POST', '/auth/refresh', () => [200, { data: { accessToken: 'again', user: null } }]);
    on('GET', '/always401', () => [401, {}]);
    await expect(api.get('/always401')).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls.filter((c) => c === 'GET /always401')).toHaveLength(2);
  });

  it('refreshSession stores the new session', async () => {
    on('POST', '/auth/refresh', () => [200, { data: { accessToken: 't2', user: { _id: 'u2' } } }]);
    await expect(refreshSession()).resolves.toBe('t2');
    expect(useAuthStore.getState().user._id).toBe('u2');
  });
});
