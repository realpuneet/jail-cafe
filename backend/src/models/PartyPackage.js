import mongoose from 'mongoose';
import { PARTY_TYPES } from '../utils/constants.js';
import { imageSchema } from './schemas/image.js';

const maxLen = (n) => ({ validator: (v) => !v || v.length <= n, message: `At most ${n} entries` });

const partyPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true },
    type: { type: String, enum: PARTY_TYPES, default: 'other' },
    tagline: { type: String, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 1000 },
    image: { type: imageSchema, default: undefined },
    pricePerGuest: { type: Number, required: true, min: 0 }, // paise, "starting from"
    minGuests: { type: Number, min: 1, default: 10 },
    maxGuests: { type: Number, min: 1, default: 100 },
    durationHours: { type: Number, min: 1, max: 12, default: 3 },
    inclusions: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      default: undefined,
      validate: maxLen(20),
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

partyPackageSchema.index({ slug: 1 }, { unique: true });
// Public package list in display order.
partyPackageSchema.index({ isActive: 1, sortOrder: 1 });

export const PartyPackage =
  mongoose.models.PartyPackage ?? mongoose.model('PartyPackage', partyPackageSchema);
