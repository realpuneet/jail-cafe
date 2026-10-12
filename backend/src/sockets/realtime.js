import { Emitter } from '@socket.io/redis-emitter';
import { getRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Publish realtime events from anywhere (API request, BullMQ worker, other process).
 * Uses the live Socket.io server when this process has one; otherwise falls back to the
 * Redis emitter, so events still reach clients connected to other instances.
 */
let io = null;
let emitter = null;

export const setIo = (server) => {
  io = server;
};

export const rooms = Object.freeze({
  user: (id) => `user:${id}`,
  order: (id) => `order:${id}`,
  staff: 'staff',
  riders: 'riders',
});

/** Mutable so tests can intercept. */
export const realtime = {
  /**
   * @param {string|string[]} room
   * @param {string} event
   * @param {unknown} payload
   */
  emit(room, event, payload) {
    try {
      const target = io ?? (emitter ??= new Emitter(getRedis()));
      const rs = Array.isArray(room) ? room : [room];
      rs.reduce((t, r) => t.to(r), target).emit(event, payload);
    } catch (err) {
      logger.warn({ err: err.message, event }, 'realtime emit failed');
    }
  },
};
