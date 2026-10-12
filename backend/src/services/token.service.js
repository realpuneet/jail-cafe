import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { TOKEN } from '../utils/constants.js';
import { toSeconds } from '../utils/duration.js';

const signOpts = { issuer: TOKEN.ISSUER, algorithm: 'HS256' };
const verifyOpts = { issuer: TOKEN.ISSUER, algorithms: ['HS256'] };

/** @param {{_id: any, role: string}} user */
export const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    ...signOpts,
    subject: String(user._id),
    expiresIn: toSeconds(env.JWT_ACCESS_EXPIRES),
  });

/** @returns {{sub: string, role: string}} */
export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET, verifyOpts);

async function createRefresh(userId, family, meta) {
  const jti = randomUUID();
  const ttl = toSeconds(env.JWT_REFRESH_EXPIRES);
  const token = jwt.sign({ fam: family }, env.JWT_REFRESH_SECRET, {
    ...signOpts,
    subject: String(userId),
    jwtid: jti,
    expiresIn: ttl,
  });
  await RefreshToken.create({
    jti,
    family,
    userId,
    expiresAt: new Date(Date.now() + ttl * 1000),
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip,
  });
  return { token, jti };
}

/**
 * Start a new session: access token + refresh token in a fresh family.
 * @param {{_id: any, role: string}} user
 * @param {{userAgent?: string, ip?: string}} [meta]
 */
export async function issueTokenPair(user, meta = {}) {
  const { token } = await createRefresh(user._id, randomUUID(), meta);
  return { accessToken: signAccessToken(user), refreshToken: token };
}

/**
 * Rotate a refresh token. A reused (already rotated) token revokes the whole family.
 * @param {string} refreshToken
 * @param {{userAgent?: string, ip?: string}} [meta]
 */
export async function rotateRefreshToken(refreshToken, meta = {}) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, verifyOpts);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  // Atomic claim: only one concurrent request can flip revokedAt from empty.
  const claimed = await RefreshToken.findOneAndUpdate(
    { jti: payload.jti, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
    { returnDocument: 'before' },
  ).lean();

  if (!claimed) {
    const existing = await RefreshToken.findOne({ jti: payload.jti }, 'family revokedAt').lean();
    const withinGrace =
      existing?.revokedAt &&
      Date.now() - existing.revokedAt.getTime() < TOKEN.REUSE_GRACE_SECONDS * 1000;
    if (existing && !withinGrace) await revokeFamily(existing.family); // theft suspected
    throw ApiError.unauthorized('Refresh token already used or revoked');
  }

  const user = await User.findById(claimed.userId, 'role isActive').lean();
  if (!user || !user.isActive) {
    await revokeFamily(claimed.family);
    throw ApiError.unauthorized('Account is disabled');
  }

  const next = await createRefresh(user._id, claimed.family, meta);
  await RefreshToken.updateOne({ jti: payload.jti }, { $set: { replacedBy: next.jti } });
  return { user, accessToken: signAccessToken(user), refreshToken: next.token };
}

/** @param {string} family */
export const revokeFamily = (family) =>
  RefreshToken.updateMany(
    { family, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );

/** Revoke the session a (possibly expired) refresh token belongs to. Never throws on bad tokens. */
export async function revokeByToken(refreshToken) {
  const payload = jwt.decode(refreshToken);
  if (payload?.fam) await revokeFamily(payload.fam);
}

/** @param {any} userId */
export const revokeAllForUser = (userId) =>
  RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
