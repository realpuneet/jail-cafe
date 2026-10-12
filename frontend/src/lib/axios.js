import axios from 'axios';
import { env } from './env.js';
import { useAuthStore } from '../features/auth/authStore.js';

const config = { baseURL: env.apiBaseUrl, withCredentials: true, timeout: 20_000 };

/** Axios without interceptors, used for the refresh call itself. */
const bare = axios.create(config);
export const api = axios.create(config);

let refreshing = null;

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share one request,
 * because refresh tokens are single-use (rotation).
 * @returns {Promise<string>} new access token
 */
export function refreshSession() {
  refreshing ??= bare
    .post('/auth/refresh')
    .then((res) => {
      useAuthStore.getState().setSession(res.data.data);
      return res.data.data.accessToken;
    })
    .catch((err) => {
      useAuthStore.getState().clear();
      throw err;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((req) => {
  const token = useAuthStore.getState().accessToken;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config: original } = error;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshSession();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        // fall through with the original 401
      }
    }
    return Promise.reject(error);
  },
);

/** Unwrap the `{ success, message, data, meta }` envelope. */
export const unwrap = (res) => res.data.data;
export const unwrapWithMeta = (res) => ({ data: res.data.data, meta: res.data.meta });
