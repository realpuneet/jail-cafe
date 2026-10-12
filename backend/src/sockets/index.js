import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env.js';
import { createRedisConnection, getRedis, key } from '../config/redis.js';
import { blockedKey } from '../middlewares/auth.js';
import { Order } from '../models/Order.js';
import { verifyAccessToken } from '../services/token.service.js';
import { ORDER_STATUS, ROLES, SOCKET_EVENTS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { realtime, rooms, setIo } from './realtime.js';

const STAFF = [ROLES.ADMIN, ROLES.STAFF];
const LOCATION_MIN_INTERVAL_MS = 2000;
const AUTH_CACHE_MS = 30_000;
export const riderLocationKey = (orderId) => key('rider', 'loc', orderId);

const isValidObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

/** Can this socket's user watch / publish for this order? */
async function loadAccess(socket, orderId) {
  const order = await Order.findById(orderId, 'userId riderId status').lean();
  if (!order) return null;
  const { id, role } = socket.data.user;
  const owner = String(order.userId) === id;
  const assignedRider = order.riderId && String(order.riderId) === id;
  const canWatch = owner || STAFF.includes(role) || (role === ROLES.RIDER && assignedRider);
  return { canWatch, assignedRider: Boolean(assignedRider), status: order.status };
}

/**
 * Attach Socket.io to the HTTP server. Uses the Redis adapter outside tests so rooms and
 * broadcasts work across instances (LB needs sticky sessions for the long-polling handshake,
 * or clients can use websocket-only transport).
 * @param {import('node:http').Server} httpServer
 * @returns {{io: Server, close: () => Promise<void>}}
 */
export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URLS, credentials: true },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e5,
  });

  const extra = [];
  if (!env.isTest) {
    const pub = createRedisConnection('io-pub');
    const sub = pub.duplicate();
    extra.push(pub, sub);
    io.adapter(createAdapter(pub, sub, { key: `${env.REDIS_KEY_PREFIX}io` }));
  }
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      if (await getRedis().exists(blockedKey(payload.sub))) return next(new Error('forbidden'));
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(rooms.user(id));
    if (STAFF.includes(role)) socket.join(rooms.staff);
    if (role === ROLES.RIDER) socket.join(rooms.riders);
    const allowed = new Map(); // orderId -> { until, assignedRider, status }
    let lastLocationAt = 0;

    socket.on('order:subscribe', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const orderId = payload?.orderId;
        if (!isValidObjectId(orderId)) return reply({ ok: false, error: 'invalid_order' });
        const access = await loadAccess(socket, orderId);
        if (!access?.canWatch) return reply({ ok: false, error: 'not_found' });
        await socket.join(rooms.order(orderId));
        const last = await getRedis().get(riderLocationKey(orderId));
        return reply({ ok: true, status: access.status, location: last ? JSON.parse(last) : null });
      } catch (err) {
        logger.warn({ err: err.message }, 'order:subscribe failed');
        return reply({ ok: false, error: 'server_error' });
      }
    });

    socket.on('order:unsubscribe', (payload) => {
      if (isValidObjectId(payload?.orderId)) socket.leave(rooms.order(payload.orderId));
    });

    socket.on('rider:location', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (role !== ROLES.RIDER) return reply({ ok: false, error: 'forbidden' });
        const { orderId, lat, lng } = payload ?? {};
        const valid =
          isValidObjectId(orderId) &&
          Number.isFinite(lat) &&
          lat >= -90 &&
          lat <= 90 &&
          Number.isFinite(lng) &&
          lng >= -180 &&
          lng <= 180;
        if (!valid) return reply({ ok: false, error: 'invalid_payload' });

        const now = Date.now();
        if (now - lastLocationAt < LOCATION_MIN_INTERVAL_MS)
          return reply({ ok: false, error: 'too_fast' });
        lastLocationAt = now;

        let entry = allowed.get(orderId);
        if (!entry || entry.until < now) {
          const access = await loadAccess(socket, orderId);
          entry = {
            until: now + AUTH_CACHE_MS,
            ok: Boolean(access?.assignedRider && access.status === ORDER_STATUS.OUT_FOR_DELIVERY),
          };
          allowed.set(orderId, entry);
        }
        if (!entry.ok) return reply({ ok: false, error: 'not_assigned' });

        const location = { lat, lng, at: now };
        await getRedis().set(riderLocationKey(orderId), JSON.stringify(location), 'EX', 600);
        realtime.emit(rooms.order(orderId), SOCKET_EVENTS.ORDER_LOCATION, { orderId, ...location });
        return reply({ ok: true });
      } catch (err) {
        logger.warn({ err: err.message }, 'rider:location failed');
        return reply({ ok: false, error: 'server_error' });
      }
    });
  });

  return {
    io,
    close: async () => {
      setIo(null);
      await io.close();
      await Promise.all(extra.map((c) => c.quit().catch(() => c.disconnect())));
    },
  };
}
