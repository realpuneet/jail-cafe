import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { emailService } from '../../src/integrations/email.service.js';
import { whatsappService } from '../../src/integrations/whatsapp.service.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { Notification } from '../../src/models/Notification.js';
import { User } from '../../src/models/User.js';
import { notify, processNotification } from '../../src/services/notification.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { captureOtps, loginCustomer } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const api = (p) => `/api/v1${p}`;
let app;
let emits;
const job = (data, id = '1') => ({ id, queueName: 'notifications', data });

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(async () => {
  setQueueAdapter(null);
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  emits = [];
  realtime.emit = jest.fn((room, event, payload) => emits.push({ room, event, payload }));
  whatsappService.sendText = jest.fn(async () => true);
  emailService.send = jest.fn(async () => true);
});

describe('notification worker', () => {
  it('stores the in-app notification, pushes it over the socket and sends WhatsApp', async () => {
    const user = await User.create({ phone: '+919876543210', email: 'a@b.in' });
    await processNotification(
      job({
        userId: String(user._id),
        type: 'order_status',
        title: 'Hi',
        body: 'Body',
        channels: ['whatsapp'],
      }),
    );
    expect(await Notification.countDocuments({ userId: user._id })).toBe(1);
    expect(emits[0]).toMatchObject({ room: `user:${user._id}`, event: 'notification:new' });
    expect(whatsappService.sendText).toHaveBeenCalledWith('+919876543210', 'Hi\nBody');
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('is idempotent on retry: no duplicate in-app doc; failed channels throw so BullMQ retries', async () => {
    const user = await User.create({ phone: '+919876543210', email: 'a@b.in' });
    const data = {
      userId: String(user._id),
      type: 't',
      title: 'Hi',
      body: 'B',
      channels: ['whatsapp', 'email'],
    };
    whatsappService.sendText = jest
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue(true);
    await expect(processNotification(job(data))).rejects.toThrow(/whatsapp: 503/);
    await expect(processNotification(job(data))).resolves.toBeUndefined();
    expect(await Notification.countDocuments()).toBe(1);
    expect(emits).toHaveLength(1); // socket push only on first creation
  });

  it('enqueues with a dedupe job id and never throws into the request path', async () => {
    const added = [];
    setQueueAdapter(async (...a) => added.push(a));
    await notify('u1', { type: 't', title: 'x', body: 'y' }, { dedupeId: 'order-1-ACCEPTED' });
    expect(added[0][0]).toBe('notifications');
    expect(added[0][3]).toEqual({ jobId: 'order-1-ACCEPTED' });
    setQueueAdapter(async () => {
      throw new Error('redis down');
    });
    await expect(notify('u1', { type: 't', title: 'x', body: 'y' })).resolves.toBeUndefined();
  });
});

describe('notification API', () => {
  it('lists newest first, counts unread, marks read', async () => {
    const { accessToken, user } = await loginCustomer(app, captureOtps());
    const auth = { Authorization: `Bearer ${accessToken}` };
    const other = await User.create({ phone: '+919111111111' });
    await Notification.create([
      { userId: user._id, type: 't', title: 'one', body: 'b' },
      { userId: user._id, type: 't', title: 'two', body: 'b' },
      { userId: other._id, type: 't', title: 'not mine', body: 'b' },
    ]);
    const list = await request(app).get(api('/notifications?limit=1')).set(auth).expect(200);
    expect(list.body.data[0].title).toBe('two');
    expect(list.body.meta.hasMore).toBe(true);
    expect(
      (await request(app).get(api('/notifications/unread-count')).set(auth)).body.data.count,
    ).toBe(2);

    const [first] = (await request(app).get(api('/notifications')).set(auth)).body.data;
    await request(app)
      .post(api('/notifications/read'))
      .set(auth)
      .send({ ids: [first._id] })
      .expect(200);
    expect(
      (await request(app).get(api('/notifications/unread-count')).set(auth)).body.data.count,
    ).toBe(1);
    const all = await request(app).post(api('/notifications/read')).set(auth).send({}).expect(200);
    expect(all.body.data.updated).toBe(1);
    await request(app).get(api('/notifications')).expect(401);
  });
});
