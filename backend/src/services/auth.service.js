import argon2 from 'argon2';
import { getRedis, key } from '../config/redis.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { LOGIN, ROLES } from '../utils/constants.js';
import * as otpService from './otp.service.js';
import * as tokenService from './token.service.js';

let dummyHash;
/** Verified against when the account does not exist so response time doesn't reveal existence. */
const getDummyHash = async () => (dummyHash ??= await argon2.hash('not-a-real-password'));

export const hashPassword = (password) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/**
 * Verify OTP, create the customer on first login, start a session.
 * @param {{phone: string, otp: string, name?: string}} input
 * @param {{userAgent?: string, ip?: string}} meta
 */
export async function loginWithOtp({ phone, otp, name }, meta) {
  await otpService.verifyOtp(phone, otp);

  let user = await User.findOne({ phone });
  if (!user) {
    try {
      user = await User.create({ phone, name: name ?? '', role: ROLES.CUSTOMER });
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ phone }); // concurrent first-login race
    }
  }
  if (!user.isActive) throw ApiError.forbidden('Your account has been disabled');

  user.lastLoginAt = new Date();
  if (!user.name && name) user.name = name;
  await user.save();

  const tokens = await tokenService.issueTokenPair(user, meta);
  return { user, ...tokens };
}

/**
 * Email + password login for admin / staff / rider. Locks after repeated failures.
 * @param {{email: string, password: string}} input
 * @param {{userAgent?: string, ip?: string}} meta
 */
export async function loginWithPassword({ email, password }, meta) {
  const redis = getRedis();
  const failKey = key('login', 'fail', email);
  const failures = Number(await redis.get(failKey)) || 0;
  if (failures >= LOGIN.MAX_FAILURES) {
    throw ApiError.tooMany('Too many failed logins. Try again in 15 minutes');
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = user?.passwordHash
    ? await argon2.verify(user.passwordHash, password)
    : await argon2.verify(await getDummyHash(), password).then(() => false);

  if (!valid || user.role === ROLES.CUSTOMER) {
    const n = await redis.incr(failKey);
    if (n === 1) await redis.expire(failKey, LOGIN.LOCK_SECONDS);
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('Your account has been disabled');

  await redis.del(failKey);
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await tokenService.issueTokenPair(user, meta);
  return { user, ...tokens };
}

/** @param {string} refreshToken */
export const refresh = (refreshToken, meta) => {
  if (!refreshToken) throw ApiError.unauthorized('Missing refresh token');
  return tokenService.rotateRefreshToken(refreshToken, meta);
};

/** @param {string|undefined} refreshToken */
export const logout = async (refreshToken) => {
  if (refreshToken) await tokenService.revokeByToken(refreshToken);
};
