import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { getRedis, key } from '../config/redis.js';
import { smsService } from '../integrations/sms.service.js';
import { ApiError } from '../utils/ApiError.js';
import { OTP } from '../utils/constants.js';

const k = (kind, phone) => key('otp', kind, phone);
const hash = (phone, otp) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${phone}:${otp}`).digest();

async function assertNotLocked(redis, phone) {
  const ttl = await redis.ttl(k('lock', phone));
  if (ttl > 0) {
    throw ApiError.tooMany(`Too many attempts. Try again in ${Math.ceil(ttl / 60)} minute(s)`);
  }
}

/**
 * Generate, store (hashed, TTL) and send an OTP. Enforces resend cooldown and hourly cap.
 * @param {string} phone E.164
 * @returns {Promise<{expiresIn: number, resendIn: number}>}
 */
export async function requestOtp(phone) {
  const redis = getRedis();
  await assertNotLocked(redis, phone);

  const cooled = await redis.set(k('cool', phone), '1', 'EX', OTP.RESEND_COOLDOWN_SECONDS, 'NX');
  if (!cooled) throw ApiError.tooMany('Please wait before requesting another OTP');

  const count = await redis.incr(k('hour', phone));
  if (count === 1) await redis.expire(k('hour', phone), 3600);
  if (count > OTP.MAX_REQUESTS_PER_HOUR)
    throw ApiError.tooMany('OTP request limit reached, try later');

  const otp = String(randomInt(10 ** (OTP.LENGTH - 1), 10 ** OTP.LENGTH));
  await redis.set(
    k('code', phone),
    hash(phone, otp).toString('hex'),
    'EX',
    env.OTP_EXPIRES_SECONDS,
  );
  await redis.del(k('att', phone));

  try {
    await smsService.sendOtp(phone, otp);
  } catch (err) {
    await redis.del(k('code', phone), k('cool', phone)); // let the user retry immediately
    throw err;
  }
  return { expiresIn: env.OTP_EXPIRES_SECONDS, resendIn: OTP.RESEND_COOLDOWN_SECONDS };
}

/**
 * Verify an OTP. Single use; locks the phone after OTP_MAX_ATTEMPTS wrong tries.
 * @param {string} phone E.164
 * @param {string} otp
 */
export async function verifyOtp(phone, otp) {
  const redis = getRedis();
  await assertNotLocked(redis, phone);

  const stored = await redis.get(k('code', phone));
  if (!stored) throw ApiError.badRequest('OTP expired or not requested');

  const given = hash(phone, otp);
  const expected = Buffer.from(stored, 'hex');
  const ok = expected.length === given.length && timingSafeEqual(expected, given);

  if (!ok) {
    const attempts = await redis.incr(k('att', phone));
    if (attempts === 1) await redis.expire(k('att', phone), env.OTP_EXPIRES_SECONDS);
    if (attempts >= env.OTP_MAX_ATTEMPTS) {
      await redis.set(k('lock', phone), '1', 'EX', OTP.LOCK_SECONDS);
      await redis.del(k('code', phone), k('att', phone));
      throw ApiError.tooMany('Too many wrong attempts. Account locked for 15 minutes');
    }
    throw ApiError.unauthorized(`Invalid OTP. ${env.OTP_MAX_ATTEMPTS - attempts} attempt(s) left`);
  }
  await redis.del(k('code', phone), k('att', phone));
}
