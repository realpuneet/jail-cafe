const trim = (v) => (v ?? '').replace(/\/+$/, '');

/** Typed access to build-time config (only VITE_* values reach the browser). */
export const env = Object.freeze({
  apiBaseUrl: trim(import.meta.env.VITE_API_BASE_URL) || 'http://localhost:5000/api/v1',
  socketUrl: trim(import.meta.env.VITE_SOCKET_URL) || 'http://localhost:5000',
  imagekitEndpoint: trim(import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT),
  imagekitPublicKey: import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY ?? '',
  razorpayKeyId: import.meta.env.VITE_RAZORPAY_KEY_ID ?? '',
  appName: import.meta.env.VITE_APP_NAME || 'Jail Ki Chai',
});
