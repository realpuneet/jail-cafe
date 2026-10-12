import { z } from 'zod';
import { ADDRESS } from '../utils/constants.js';
import { phoneSchema } from './common.js';

const fields = {
  label: z.enum(ADDRESS.LABELS),
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200),
  landmark: z.string().trim().max(120),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean(),
};

const geoPair = (v) => (v.lat === undefined) === (v.lng === undefined);
const geoMsg = { message: 'lat and lng must be provided together' };

export const createAddressBody = z
  .object({
    ...fields,
    label: fields.label.default('home'),
    line2: fields.line2.optional(),
    landmark: fields.landmark.optional(),
    lat: fields.lat.optional(),
    lng: fields.lng.optional(),
    isDefault: fields.isDefault.optional(),
  })
  .refine(geoPair, geoMsg);

export const updateAddressBody = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .refine(geoPair, geoMsg);
