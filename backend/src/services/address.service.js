import mongoose from 'mongoose';
import { Address } from '../models/Address.js';
import { ApiError } from '../utils/ApiError.js';
import { ADDRESS } from '../utils/constants.js';

const toGeo = ({ lat, lng, ...rest }) =>
  lat !== undefined && lng !== undefined
    ? { ...rest, location: { type: 'Point', coordinates: [lng, lat] } }
    : rest;

/** @param {string} userId */
export const list = (userId) =>
  Address.find({ userId }).sort({ isDefault: -1, _id: -1 }).limit(ADDRESS.MAX_PER_USER).lean();

async function getOwned(userId, id) {
  const address = await Address.findOne({ _id: id, userId }).lean();
  if (!address) throw ApiError.notFound('Address not found');
  return address;
}
export const get = getOwned;

/**
 * Create an address. The first address becomes the default.
 * @param {string} userId
 * @param {object} input validated address fields (+ optional lat/lng, isDefault)
 */
export async function create(userId, input) {
  const count = await Address.countDocuments({ userId });
  if (count >= ADDRESS.MAX_PER_USER) {
    throw ApiError.badRequest(`You can save at most ${ADDRESS.MAX_PER_USER} addresses`);
  }
  const makeDefault = input.isDefault === true || count === 0;
  const doc = await Address.create({ ...toGeo(input), userId, isDefault: false });
  if (makeDefault) await setDefault(userId, doc._id);
  return getOwned(userId, doc._id);
}

/**
 * @param {string} userId
 * @param {string} id
 * @param {object} patch
 */
export async function update(userId, id, patch) {
  const { isDefault, ...fields } = patch;
  const res = await Address.updateOne(
    { _id: id, userId },
    { $set: toGeo(fields) },
    { runValidators: true },
  );
  if (res.matchedCount === 0) throw ApiError.notFound('Address not found');
  if (isDefault === true) await setDefault(userId, id);
  return getOwned(userId, id);
}

/**
 * Make one address the default atomically (transaction keeps the unique partial index happy).
 * @param {string} userId
 * @param {string|import('mongoose').Types.ObjectId} id
 */
export async function setDefault(userId, id) {
  await getOwned(userId, id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Address.updateMany(
        { userId, isDefault: true },
        { $set: { isDefault: false } },
        { session },
      );
      await Address.updateOne({ _id: id, userId }, { $set: { isDefault: true } }, { session });
    });
  } finally {
    await session.endSession();
  }
  return getOwned(userId, id);
}

/**
 * Delete an address; if it was the default, promote the newest remaining one.
 * @param {string} userId
 * @param {string} id
 */
export async function remove(userId, id) {
  const doc = await Address.findOneAndDelete({ _id: id, userId }).lean();
  if (!doc) throw ApiError.notFound('Address not found');
  if (doc.isDefault) {
    const next = await Address.findOne({ userId }, '_id').sort({ _id: -1 }).lean();
    if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
}
