import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 40 }, // order_status, booking_reminder, ...
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 400 },
    data: { type: mongoose.Schema.Types.Mixed },
    readAt: { type: Date },
    dedupeKey: { type: String, maxlength: 120 }, // job id => retries never double-insert
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Inbox, newest first (cursor on _id).
notificationSchema.index({ userId: 1, _id: -1 });
// Unread badge count.
notificationSchema.index({ userId: 1, readAt: 1 });
// Retry-safe creation.
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
// TTL: keep 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const Notification =
  mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
