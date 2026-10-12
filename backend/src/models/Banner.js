import mongoose from 'mongoose';
import { BANNER_POSITIONS } from '../utils/constants.js';
import { imageSchema } from './schemas/image.js';

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    subtitle: { type: String, trim: true, maxlength: 160 },
    image: { type: imageSchema, required: true },
    linkUrl: { type: String, trim: true, maxlength: 300 }, // in-app path (/menu) or https url
    position: { type: String, enum: BANNER_POSITIONS, default: 'home_hero' },
    sortOrder: { type: Number, default: 0 },
    startsAt: { type: Date },
    endsAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Public banners per slot, in order.
bannerSchema.index({ isActive: 1, position: 1, sortOrder: 1 });

export const Banner = mongoose.models.Banner ?? mongoose.model('Banner', bannerSchema);
