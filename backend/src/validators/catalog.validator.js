import { z } from 'zod';
import { BANNER_POSITIONS, DISCOUNT_TYPES, ZONE_KINDS } from '../utils/constants.js';
import { cursorQuery, imageSchema, objectId } from './common.js';

const paise = z.number().int().min(0).max(10_000_000);
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const partial = (schema) =>
  schema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* ---- categories ---- */
const categoryFields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  image: imageSchema.optional(),
  sortOrder: z.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
};
export const createCategoryBody = z.object(categoryFields);
export const updateCategoryBody = partial(
  z
    .object(categoryFields)
    .omit({ sortOrder: true, isActive: true })
    .extend({
      sortOrder: z.number().int().min(-1000).max(1000),
      isActive: z.boolean(),
    }),
);

/* ---- menu items ---- */
const named = z.object({
  name: z.string().trim().min(1).max(40),
  price: paise,
  isAvailable: z.boolean().optional(),
});
const menuFields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  categoryId: objectId,
  isVeg: z.boolean(),
  price: paise,
  mrp: paise.optional(),
  taxPercent: z.number().min(0).max(28).optional(),
  image: imageSchema.optional(),
  gallery: z.array(imageSchema).max(4).optional(),
  variants: z.array(named).max(10).optional(),
  addOns: z
    .array(named.extend({ isVeg: z.boolean().optional() }))
    .max(20)
    .optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
  prepTimeMinutes: z.number().int().min(0).max(240).optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isAvailable: z.boolean().optional(),
};
const mrpCheck = (v) => v.mrp === undefined || v.price === undefined || v.mrp >= v.price;
export const createMenuItemBody = z.object(menuFields).refine(mrpCheck, 'mrp must be >= price');
export const updateMenuItemBody = partial(z.object(menuFields)).refine(
  mrpCheck,
  'mrp must be >= price',
);
export const availabilityBody = z.object({ isAvailable: z.boolean() });

export const publicMenuQuery = z.object({
  category: objectId.optional(),
  veg: bool.optional(),
  available: bool.optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export const adminMenuQuery = cursorQuery.extend({ category: objectId.optional() });
export const slugOrIdParams = z.object({ idOrSlug: z.string().trim().min(1).max(120) });

/* ---- banners ---- */
const bannerFields = {
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).optional(),
  image: imageSchema,
  linkUrl: z
    .string()
    .trim()
    .max(300)
    .regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, 'Use an in-app path or an https url')
    .optional(),
  position: z.enum(BANNER_POSITIONS),
  sortOrder: z.number().int().min(-1000).max(1000),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  isActive: z.boolean(),
};
const window = (v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt;
export const createBannerBody = z
  .object({
    ...bannerFields,
    position: bannerFields.position.default('home_hero'),
    sortOrder: bannerFields.sortOrder.default(0),
    isActive: bannerFields.isActive.default(true),
  })
  .refine(window, 'endsAt must be after startsAt');
export const updateBannerBody = partial(z.object(bannerFields)).refine(
  window,
  'endsAt must be after startsAt',
);
export const publicBannerQuery = z.object({ position: z.enum(BANNER_POSITIONS).optional() });

/* ---- delivery zones ---- */
const zoneFields = {
  name: z.string().trim().min(2).max(80),
  kind: z.enum(Object.values(ZONE_KINDS)),
  pincodes: z
    .array(z.string().regex(/^[1-9]\d{5}$/))
    .min(1)
    .max(200)
    .optional(),
  minKm: z.number().min(0).max(100).optional(),
  maxKm: z.number().min(0).max(100).optional(),
  deliveryCharge: paise,
  freeDeliveryAbove: paise.optional(),
  minOrderAmount: paise.optional(),
  estimatedMinutes: z.number().int().min(0).max(240).optional(),
  isActive: z.boolean().optional(),
};
export const createZoneBody = z.object(zoneFields);
export const updateZoneBody = partial(z.object(zoneFields));
export const quoteBody = z
  .object({
    pincode: z
      .string()
      .regex(/^[1-9]\d{5}$/)
      .optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    subtotal: paise,
  })
  .refine(
    (v) => v.pincode || (v.lat !== undefined && v.lng !== undefined),
    'Provide pincode or lat+lng',
  )
  .refine(
    (v) => (v.lat === undefined) === (v.lng === undefined),
    'lat and lng must be provided together',
  );

/* ---- coupons ---- */
const couponFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,20}$/, '3-20 chars: A-Z, 0-9, _ or -'),
  description: z.string().trim().max(200).optional(),
  type: z.enum(Object.values(DISCOUNT_TYPES)),
  value: z.number().int().min(1).max(10_000_000),
  maxDiscount: paise.optional(),
  minOrderAmount: paise.optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(1).max(100).optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
};
export const createCouponBody = z.object(couponFields);
export const updateCouponBody = partial(z.object(couponFields).omit({ code: true }));
export const validateCouponBody = z.object({
  code: couponFields.code,
  subtotal: paise,
});
