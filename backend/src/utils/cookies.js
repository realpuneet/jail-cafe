import { env } from '../config/env.js';
import { TOKEN } from './constants.js';
import { toSeconds } from './duration.js';

const base = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.COOKIE_SAMESITE,
  path: `${env.API_PREFIX}/auth`, // sent only to auth endpoints
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setRefreshCookie = (res, token) =>
  res.cookie(TOKEN.REFRESH_COOKIE, token, {
    ...base(),
    maxAge: toSeconds(env.JWT_REFRESH_EXPIRES) * 1000,
  });

export const clearRefreshCookie = (res) => res.clearCookie(TOKEN.REFRESH_COOKIE, base());
