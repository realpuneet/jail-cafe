import { jest } from '@jest/globals';
import { setRedisClient } from '../../src/config/redis.js';
import { smsService } from '../../src/integrations/sms.service.js';
import * as otp from '../../src/services/otp.service.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const phone = '+919876543210';
let redis;
let sent;

beforeEach(() => {
  redis = new FakeRedis();
  setRedisClient(redis);
  sent = [];
  smsService.sendOtp = jest.fn(async (p, code) => sent.push({ p, code }));
});

describe('otp.service', () => {
  it('sends a 6-digit OTP and verifies it exactly once', async () => {
    const res = await otp.requestOtp(phone);
    expect(res.expiresIn).toBe(300);
    expect(sent[0].code).toMatch(/^\d{6}$/);
    await expect(otp.verifyOtp(phone, sent[0].code)).resolves.toBeUndefined();
    await expect(otp.verifyOtp(phone, sent[0].code)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('never stores the OTP in plain text', async () => {
    await otp.requestOtp(phone);
    const stored = [...redis.store.values()].map((e) => e.value);
    expect(stored).not.toContain(sent[0].code);
  });

  it('enforces the resend cooldown', async () => {
    await otp.requestOtp(phone);
    await expect(otp.requestOtp(phone)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('locks the phone after OTP_MAX_ATTEMPTS wrong codes', async () => {
    await otp.requestOtp(phone);
    const wrong = sent[0].code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) {
      await expect(otp.verifyOtp(phone, wrong)).rejects.toMatchObject({ statusCode: 401 });
    }
    await expect(otp.verifyOtp(phone, wrong)).rejects.toMatchObject({ statusCode: 429 });
    // even the right code is refused while locked
    await expect(otp.verifyOtp(phone, sent[0].code)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('caps OTP requests per hour', async () => {
    for (let i = 0; i < 5; i++) {
      await otp.requestOtp(phone);
      await redis.del(`${process.env.REDIS_KEY_PREFIX}otp:cool:${phone}`);
    }
    await expect(otp.requestOtp(phone)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('rolls back state when the SMS provider fails', async () => {
    smsService.sendOtp = jest.fn().mockRejectedValue(new Error('provider down'));
    await expect(otp.requestOtp(phone)).rejects.toThrow('provider down');
    expect(await redis.get(`${process.env.REDIS_KEY_PREFIX}otp:code:${phone}`)).toBeNull();
    smsService.sendOtp = jest.fn(async () => {});
    await expect(otp.requestOtp(phone)).resolves.toBeDefined(); // cooldown was released
  });
});
