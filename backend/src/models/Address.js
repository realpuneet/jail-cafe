import mongoose from 'mongoose';
import { ADDRESS } from '../utils/constants.js';

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, enum: ADDRESS.LABELS, default: 'home' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// "My addresses": default first, then newest.
addressSchema.index({ userId: 1, isDefault: -1, _id: -1 });
// At most one default per user, enforced by the database (race-safe).
addressSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'one_default_per_user' },
);
// Distance-based delivery charge (Phase 2).
addressSchema.index({ location: '2dsphere' }, { sparse: true });

export const Address = mongoose.models.Address ?? mongoose.model('Address', addressSchema);
