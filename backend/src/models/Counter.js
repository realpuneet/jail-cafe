import mongoose from 'mongoose';

/** Named atomic counters (e.g. daily order sequence). */
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
  expiresAt: { type: Date },
});
// Daily counters clean themselves up.
counterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Counter = mongoose.models.Counter ?? mongoose.model('Counter', counterSchema);

/**
 * Next value of a counter.
 * @param {string} name
 * @param {{ttlSeconds?: number}} [opts]
 */
export async function nextSeq(name, { ttlSeconds } = {}) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    {
      $inc: { seq: 1 },
      ...(ttlSeconds
        ? { $setOnInsert: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) } }
        : {}),
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return doc.seq;
}
