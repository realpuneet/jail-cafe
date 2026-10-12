import { z } from 'zod';
import { PARTY_STATUS_VALUES, PARTY_TYPES } from '../utils/constants.js';
import { isDateString, isTimeString } from '../utils/datetime.js';
import { cursorQuery, imageSchema, objectId, phoneSchema } from './common.js';

const date = z.string().refine(isDateString, 'Use YYYY-MM-DD');
const paise = z.number().int().min(0).max(100_000_000);
const partial = (schema) =>
  schema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const packageFields = {
  name: z.string().trim().min(2).max(80),
  type: z.enum(PARTY_TYPES),
  tagline: z.string().trim().max(140),
  description: z.string().trim().max(1000),
  image: imageSchema,
  pricePerGuest: paise,
  minGuests: z.number().int().min(1).max(1000),
  maxGuests: z.number().int().min(1).max(1000),
  durationHours: z.number().int().min(1).max(12),
  inclusions: z.array(z.string().trim().min(1).max(120)).max(20),
  sortOrder: z.number().int().min(-1000).max(1000),
  isActive: z.boolean(),
};
export const createPackageBody = z.object({
  ...packageFields,
  type: packageFields.type.default('other'),
  tagline: packageFields.tagline.optional(),
  description: packageFields.description.optional(),
  image: packageFields.image.optional(),
  minGuests: packageFields.minGuests.optional(),
  maxGuests: packageFields.maxGuests.optional(),
  durationHours: packageFields.durationHours.optional(),
  inclusions: packageFields.inclusions.optional(),
  sortOrder: packageFields.sortOrder.optional(),
  isActive: packageFields.isActive.optional(),
});
export const updatePackageBody = partial(z.object(packageFields));
export const publicPackagesQuery = z.object({ type: z.enum(PARTY_TYPES).optional() });
export const slugParams = z.object({ slug: z.string().trim().min(1).max(100) });

export const createInquiryBody = z.object({
  packageId: objectId.optional(),
  eventType: z.enum(PARTY_TYPES).optional(),
  eventDate: date,
  startTime: z.string().refine(isTimeString, 'Use HH:mm').optional(),
  guests: z.number().int().min(1).max(1000),
  name: z.string().trim().min(1).max(80).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().toLowerCase().email().max(120).optional(),
  requirements: z.string().trim().max(1000).optional(),
});

export const quoteBody = z.object({
  amount: paise.min(100),
  tokenAmount: paise.min(100).optional(),
  validDays: z.number().int().min(1).max(30).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export const closeBody = z.object({ reason: z.string().trim().max(300).optional() });
export const cancelBody = z.object({
  reason: z.string().trim().max(300).optional(),
  refund: z.boolean().optional(),
});

export const staffInquiriesQuery = cursorQuery.extend({
  status: z.enum(PARTY_STATUS_VALUES).optional(),
  from: date.optional(),
  to: date.optional(),
});
