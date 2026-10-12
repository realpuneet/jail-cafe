import { io } from 'socket.io-client';
import { env } from './env.js';
import { getAccessToken } from '../features/auth/authStore.js';

let socket = null;

/**
 * One shared Socket.io connection per tab. The token is read at (re)connect time so a refreshed
 * access token is used automatically. Reconnection/backoff is handled by socket.io.
 */
export function getSocket() {
  if (!socket) {
    socket = io(env.socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected && !s.active) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
