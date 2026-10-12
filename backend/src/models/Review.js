import mongoose from 'mongoose';
import { REVIEW_STATUS } from '../utils/constants.js';

const reviewSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: String, maxlength: 80 }, // first name only, shown publicly
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
    items: { type: [String], default: undefined, validate: (v) => !v || v.length <= 5 }, // snapshot of dish names
    status: { type: String, enum: Object.values(REVIEW_STATUS), default: REVIEW_STATUS.PUBLISHED },
  },
  { timestamps: true },
);

// One review per order.
reviewSchema.index({ orderId: 1 }, { unique: true });
// Public list, newest first.
reviewSchema.index({ status: 1, _id: -1 });
reviewSchema.index({ userId: 1, _id: -1 });

export const Review = mongoose.models.Review ?? mongoose.model('Review', reviewSchema);
