import { getRedis } from '../config/redis.js';
import { blockedKey } from '../middlewares/auth.js';
import { User } from '../models/User.js';
import { imagekitService } from '../integrations/imagekit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { toSeconds } from '../utils/duration.js';
import { env } from '../config/env.js';
import { paginate } from '../utils/pagination.js';
import { hashPassword } from './auth.service.js';
import { revokeAllForUser } from './token.service.js';

const PUBLIC_FIELDS = 'phone name email role isActive avatar lastLoginAt createdAt';

/** @param {string} id */
export async function getById(id) {
  const user = await User.findById(id, PUBLIC_FIELDS).lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Update own profile (name / email only).
 * @param {string} id
 * @param {{name?: string, email?: string}} patch
 */
export async function updateProfile(id, patch) {
  const user = await User.findByIdAndUpdate(
    id,
    { $set: patch },
    {
      returnDocument: 'after',
      projection: PUBLIC_FIELDS,
      runValidators: true,
    },
  ).lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Attach an avatar that the client already uploaded to ImageKit. Replaces and deletes the old one.
 * @param {string} id
 * @param {{fileId: string, url: string, filePath: string, thumbnailUrl?: string}} image
 */
export async function setAvatar(id, image) {
  if (!imagekitService.isOwnUrl(image.url)) throw ApiError.badRequest('Image url is not allowed');
  const before = await User.findByIdAndUpdate(
    id,
    { $set: { avatar: image } },
    { projection: 'avatar' },
  ).lean();
  if (!before) throw ApiError.notFound('User not found');
  if (before.avatar?.fileId && before.avatar.fileId !== image.fileId) {
    imagekitService.remove(before.avatar.fileId).catch(() => {}); // best effort cleanup
  }
  return getById(id);
}

/**
 * Admin: list users with cursor pagination.
 * @param {{role?: string, search?: string, isActive?: boolean, limit?: number, cursor?: string}} q
 */
export function list({ role, search, isActive, limit, cursor }) {
  const filter = {};
  if (role) filter.role = role;
  if (typeof isActive === 'boolean') filter.isActive = isActive;
  if (search) {
    // Prefix match on indexed phone only; avoids unindexed regex scans.
    filter.phone = { $regex: `^\\+?${search.replace(/[^\d+]/g, '')}` };
  }
  return paginate(User, { filter, projection: PUBLIC_FIELDS, limit, cursor });
}

/**
 * Admin: create staff / rider / admin with email + password.
 * @param {{name: string, phone: string, email: string, password: string, role: string}} input
 */
export async function createStaff(input) {
  const passwordHash = await hashPassword(input.password);
  const { password: _password, ...fields } = input;
  const user = await User.create({ ...fields, passwordHash });
  return getById(user._id);
}

/**
 * Admin: change role. An admin cannot demote themselves (prevents lock-out).
 * @param {string} actorId
 * @param {string} targetId
 * @param {string} role
 */
export async function setRole(actorId, targetId, role) {
  if (actorId === targetId) throw ApiError.badRequest('You cannot change your own role');
  const user = await User.findByIdAndUpdate(
    targetId,
    { $set: { role } },
    { returnDocument: 'after', projection: PUBLIC_FIELDS },
  ).lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Admin: enable / disable. Disabling revokes sessions and blocks live access tokens.
 * @param {string} actorId
 * @param {string} targetId
 * @param {boolean} isActive
 */
export async function setActive(actorId, targetId, isActive) {
  if (actorId === targetId) throw ApiError.badRequest('You cannot disable your own account');
  const user = await User.findByIdAndUpdate(
    targetId,
    { $set: { isActive } },
    { returnDocument: 'after', projection: PUBLIC_FIELDS },
  ).lean();
  if (!user) throw ApiError.notFound('User not found');
  const redis = getRedis();
  if (isActive) {
    await redis.del(blockedKey(targetId));
  } else {
    await redis.set(blockedKey(targetId), '1', 'EX', toSeconds(env.JWT_ACCESS_EXPIRES) + 60);
    await revokeAllForUser(targetId);
  }
  return user;
}
