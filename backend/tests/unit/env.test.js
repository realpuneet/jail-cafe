import { parseEnv } from '../../src/config/env.js';

const base = {
  MONGO_URI: 'mongodb://localhost:27017/?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CLIENT_URLS: 'http://localhost:5173/, http://localhost:3000',
};

describe('parseEnv', () => {
  it('applies defaults, coerces numbers and normalizes CLIENT_URLS', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(5000);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.CLIENT_URLS).toEqual(['http://localhost:5173', 'http://localhost:3000']);
    expect(env.isProd).toBe(false);
  });

  it('lists every missing/invalid variable in one error', () => {
    expect(() => parseEnv({})).toThrow(/MONGO_URI[\s\S]*REDIS_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects short or identical JWT secrets', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => parseEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('requires https origins in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/https/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', CLIENT_URLS: 'https://jailkichai.in' }),
    ).not.toThrow();
  });
});
