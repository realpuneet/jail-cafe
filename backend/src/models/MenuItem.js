import mongoose from 'mongoose';
import { imageSchema } from './schemas/image.js';

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 }, // e.g. "Half", "Full"
  price: { type: Number, required: true, min: 0 }, // paise, absolute price for this variant
  isAvailable: { type: Boolean, default: true },
});

const addOnSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  price: { type: Number, required: true, min: 0 }, // paise
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
});

const maxLen = (n) => ({ validator: (v) => !v || v.length <= n, message: `At most ${n} entries` });

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isVeg: { type: Boolean, required: true },
    price: { type: Number, required: true, min: 0 }, // paise; base price (used when no variants)
    mrp: { type: Number, min: 0 }, // paise; optional strike-through price
    taxPercent: { type: Number, min: 0, max: 28, default: 5 },
    image: { type: imageSchema, default: undefined },
    gallery: { type: [imageSchema], default: undefined, validate: maxLen(4) },
    variants: { type: [variantSchema], default: undefined, validate: maxLen(10) }, // bounded
    addOns: { type: [addOnSchema], default: undefined, validate: maxLen(20) }, // bounded
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
      default: undefined,
      validate: maxLen(10),
    },
    prepTimeMinutes: { type: Number, min: 0, max: 240, default: 15 },
    sortOrder: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true }, // stock on/off, toggled by staff
    isActive: { type: Boolean, default: true }, // soft delete
  },
  { timestamps: true },
);

menuItemSchema.index({ slug: 1 }, { unique: true });
// Category page: active items of a category in display order.
menuItemSchema.index({ categoryId: 1, isActive: 1, sortOrder: 1 });
// Veg-only browse across the whole menu.
menuItemSchema.index({ isActive: 1, isVeg: 1, sortOrder: 1 });
// Search box.
menuItemSchema.index(
  { name: 'text', tags: 'text', description: 'text' },
  { weights: { name: 10, tags: 5, description: 1 }, name: 'menu_text' },
);
// Admin list, cursor paginated by _id within a category.
menuItemSchema.index({ categoryId: 1, _id: -1 });

export const MenuItem = mongoose.models.MenuItem ?? mongoose.model('MenuItem', menuItemSchema);
