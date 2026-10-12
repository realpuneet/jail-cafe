import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emailService } from '../integrations/email.service.js';
import { whatsappService } from '../integrations/whatsapp.service.js';
import { enqueue } from '../jobs/queues.js';
import { realtime, rooms } from '../sockets/realtime.js';
import { ApiError } from '../utils/ApiError.js';
import { JOBS, QUEUES, SOCKET_EVENTS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { paginate } from '../utils/pagination.js';

/**
 * Queue a notification for a user (in-app + realtime push + WhatsApp + email).
 * Returns immediately; delivery happens in the worker with retries.
 * @param {any} userId
 * @param {{type: string, title: string, body: string, data?: object, channels?: Array<'whatsapp'|'email'>}} n
 * @param {{dedupeId?: string}} [opts] same dedupeId => at most one notification
 */
export function notify(userId, n, { dedupeId } = {}) {
  return enqueue(
    QUEUES.NOTIFICATIONS,
    JOBS.NOTIFY,
    { userId: String(userId), channels: ['whatsapp'], ...n },
    dedupeId ? { jobId: dedupeId } : {},
  ).catch((err) =>
    logger.error({ err: err.message, type: n.type }, 'could not enqueue notification'),
  );
}

/**
 * Worker handler. Idempotent under retries: the in-app doc is keyed by job id and channel
 * failures throw so BullMQ retries with backoff.
 * @param {import('bullmq').Job} job
 */
export async function processNotification(job) {
  const { userId, type, title, body, data, channels = [] } = job.data;
  const dedupeKey = `${job.queueName}:${job.id}`;

  let doc;
  try {
    doc = await Notification.create({ userId, type, title, body, data, dedupeKey });
    realtime.emit(rooms.user(userId), SOCKET_EVENTS.NOTIFICATION, {
      _id: doc._id,
      type,
      title,
      body,
      data,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // already created on an earlier attempt
  }

  const user = await User.findById(userId, 'phone email').lean();
  if (!user) return;
  const failures = [];
  if (channels.includes('whatsapp') && user.phone) {
    await whatsappService
      .sendText(user.phone, `${title}\n${body}`)
      .catch((e) => failures.push(`whatsapp: ${e.message}`));
  }
  if (channels.includes('email') && user.email) {
    await emailService
      .send({ to: user.email, subject: title, text: body })
      .catch((e) => failures.push(`email: ${e.message}`));
  }
  if (failures.length) throw new Error(failures.join('; ')); // retry with backoff
}

/** @param {string} userId @param {{limit?: number, cursor?: string}} q */
export const list = (userId, q) =>
  paginate(Notification, { filter: { userId }, limit: q.limit, cursor: q.cursor });

export const unreadCount = (userId) =>
  Notification.countDocuments({ userId, readAt: { $exists: false } });

/** Mark given ids (or everything when ids is omitted) as read. */
export async function markRead(userId, ids) {
  const filter = { userId, readAt: { $exists: false }, ...(ids ? { _id: { $in: ids } } : {}) };
  const res = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return { updated: res.modifiedCount };
}

export async function getOne(userId, id) {
  const n = await Notification.findOne({ _id: id, userId }).lean();
  if (!n) throw ApiError.notFound('Notification not found');
  return n;
}
