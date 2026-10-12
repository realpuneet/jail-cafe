import { Redis } from 'ioredis';
import { setQueueAdapter, closeQueues, enqueue, getQueue } from '../../src/jobs/queues.js';
import { registerHandlers, startWorkers } from '../../src/jobs/workers.js';
import { Notification } from '../../src/models/Notification.js';
import { User } from '../../src/models/User.js';
import { whatsappService } from '../../src/integrations/whatsapp.service.js';
import { QUEUES } from '../../src/utils/constants.js';
import { realtime } from '../../src/sockets/realtime.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';

// These tests need a real Redis (BullMQ uses Lua scripts). CI provides one; locally set RUN_REDIS_TESTS=1.
const enabled = process.env.RUN_REDIS_TESTS === '1' || process.env.CI === 'true';
const d = enabled ? describe : describe.skip;

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 50));
  }
};

d('BullMQ workers (real Redis)', () => {
  let closeWorkers;
  let raw;

  beforeAll(async () => {
    setQueueAdapter(null);
    await startDb();
    raw = new Redis(process.env.REDIS_URL);
    realtime.emit = () => {};
  });
  afterAll(async () => {
    await closeWorkers?.();
    await closeQueues();
    await raw.quit();
    await stopDb();
  });
  beforeEach(async () => {
    await clearDb();
    const keys = await raw.keys('jkc:bull*');
    if (keys.length) await raw.del(...keys);
    whatsappService.sendText = async () => true;
    closeWorkers = await startWorkers();
  });
  afterEach(async () => {
    await closeWorkers();
    closeWorkers = undefined;
  });

  it('delivers a queued notification end to end', async () => {
    const user = await User.create({ phone: '+919876543210' });
    await enqueue(QUEUES.NOTIFICATIONS, 'notify', {
      userId: String(user._id),
      type: 't',
      title: 'Hello',
      body: 'World',
      channels: ['whatsapp'],
    });
    const doc = await waitFor(() => Notification.findOne({ userId: user._id }));
    expect(doc.title).toBe('Hello');
  });

  it('dedupes by job id', async () => {
    const user = await User.create({ phone: '+919876543210' });
    const data = { userId: String(user._id), type: 't', title: 'Once', body: 'b', channels: [] };
    await enqueue(QUEUES.NOTIFICATIONS, 'notify', data, { jobId: 'same-id' });
    await enqueue(QUEUES.NOTIFICATIONS, 'notify', data, { jobId: 'same-id' });
    await waitFor(() => Notification.countDocuments({ userId: user._id }));
    await new Promise((r) => setTimeout(r, 300));
    expect(await Notification.countDocuments({ userId: user._id })).toBe(1);
  });

  it('retries with backoff, then moves exhausted jobs to the dead-letter queue', async () => {
    let attempts = 0;
    registerHandlers(QUEUES.NOTIFICATIONS, {
      flaky: () => {
        attempts += 1;
        throw new Error('provider exploded');
      },
    });
    await enqueue(
      QUEUES.NOTIFICATIONS,
      'flaky',
      { hello: 'world' },
      { attempts: 3, backoff: { type: 'fixed', delay: 50 } },
    );
    const dead = await waitFor(async () =>
      (
        await getQueue(QUEUES.NOTIFICATIONS_DLQ).getJobs([
          'waiting',
          'completed',
          'delayed',
          'active',
        ])
      ).at(0),
    );
    expect(attempts).toBe(3);
    expect(dead.data).toMatchObject({
      queue: 'notifications',
      name: 'flaky',
      error: 'provider exploded',
      data: { hello: 'world' },
    });
  });

  it('succeeds on a later attempt without dead-lettering', async () => {
    let n = 0;
    registerHandlers(QUEUES.NOTIFICATIONS, {
      recovers: () => {
        n += 1;
        if (n < 2) throw new Error('transient');
        return 'ok';
      },
    });
    const job = await enqueue(
      QUEUES.NOTIFICATIONS,
      'recovers',
      {},
      { attempts: 3, backoff: { type: 'fixed', delay: 50 } },
    );
    await waitFor(async () => (await getQueue(QUEUES.NOTIFICATIONS).getJob(job.id))?.finishedOn);
    expect(n).toBe(2);
    expect(
      await getQueue(QUEUES.NOTIFICATIONS_DLQ).getJobCountByTypes(
        'waiting',
        'completed',
        'delayed',
      ),
    ).toBe(0);
  });

  it('registers the repeatable maintenance scheduler once, even across restarts', async () => {
    await closeWorkers();
    closeWorkers = await startWorkers(); // second start must not duplicate
    const schedulers = await getQueue(QUEUES.MAINTENANCE).getJobSchedulers();
    expect(schedulers.filter((s) => s.name === 'expire-unpaid-orders')).toHaveLength(1);
    expect(schedulers[0].every).toBe(300000);
  });
});
