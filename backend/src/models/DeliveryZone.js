import mongoose from 'mongoose';
import { ZONE_KINDS } from '../utils/constants.js';

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: Object.values(ZONE_KINDS), required: true },
    // kind=pincode
    pincodes: {
      type: [{ type: String, match: /^[1-9]\d{5}$/ }],
      default: undefined,
      validate: {
        validator: (v) => !v || v.length <= 200,
        message: 'At most 200 pincodes per zone',
      },
    },
    // kind=distance (km from the cafe, minKm < distance <= maxKm)
    minKm: { type: Number, min: 0 },
    maxKm: { type: Number, min: 0 },
    deliveryCharge: { type: Number, required: true, min: 0 }, // paise
    freeDeliveryAbove: { type: Number, min: 0 }, // paise subtotal threshold
    minOrderAmount: { type: Number, min: 0 }, // paise, overrides MIN_ORDER_AMOUNT when set
    estimatedMinutes: { type: Number, min: 0, default: 40 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Pincode lookup (multikey) - also guarantees the same pincode is not served by many zones silently.
deliveryZoneSchema.index({ pincodes: 1, isActive: 1 });
deliveryZoneSchema.index({ isActive: 1, kind: 1, minKm: 1 });

export const DeliveryZone =
  mongoose.models.DeliveryZone ?? mongoose.model('DeliveryZone', deliveryZoneSchema);
