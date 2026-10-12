import { z } from 'zod';
import { REVIEW_STATUS } from '../utils/constants.js';
import { cursorQuery, objectId } from './common.js';

export const dashboardQuery = z.object({ days: z.coerce.number().int().min(1).max(92).default(7) });
export const settingsBody = z
  .object({
    acceptingOrders: z.boolean(),
    acceptingBookings: z.boolean(),
    announcement: z.string().trim().max(200),
    openingHours: z.string().trim().max(200),
    contactPhone: z.string().trim().max(20),
    address: z.string().trim().max(300),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const createReviewBody = z.object({
  orderId: objectId,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export const reviewStatusBody = z.object({ status: z.enum(Object.values(REVIEW_STATUS)) });
export const adminReviewsQuery = cursorQuery.extend({
  status: z.enum(Object.values(REVIEW_STATUS)).optional(),
});
export const orderIdParams = z.object({ orderId: objectId });
