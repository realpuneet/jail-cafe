import mongoose from 'mongoose';
import { imageSchema } from './schemas/image.js';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 300 },
    image: { type: imageSchema, default: undefined },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true });
// Public category list: active, in display order.
categorySchema.index({ isActive: 1, sortOrder: 1 });

export const Category = mongoose.models.Category ?? mongoose.model('Category', categorySchema);
