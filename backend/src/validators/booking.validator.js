import { z } from 'zod';
import { BOOKING, BOOKING_STATUS, BOOKING_STATUS_VALUES } from '../utils/constants.js';
import { isDateString, isTimeString } from '../utils/datetime.js';
import { cursorQuery, objectId, phoneSchema } from './common.js';

const date = z.string().refine(isDateString, 'Use YYYY-MM-DD');
const time = z.string().refine(isTimeString, 'Use HH:mm (24h)');
const paise = z.number().int().min(0).max(10_000_000);

export const availabilityQuery = z.object({ date });

export const createBookingBody = z.object({
  slotId: objectId,
  date,
  guests: z.number().int().min(1).max(50),
  name: z.string().trim().min(1).max(80).optional(),
  phone: phoneSchema.optional(),
  note: z.string().trim().max(300).optional(),
});

export const cancelBookingBody = z.object({ reason: z.string().trim().max(200).optional() });
export const outcomeBody = z.object({
  status: z.enum([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.NO_SHOW]),
});

export const staffBookingsQuery = cursorQuery.extend({
  date: date.optional(),
  status: z.enum(BOOKING_STATUS_VALUES).optional(),
});
export const calendarQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
});

const slotFields = {
  label: z.string().trim().min(2).max(40),
  startTime: time,
  endTime: time,
  capacity: z.number().int().min(1).max(2000),
  maxPartySize: z.number().int().min(1).max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  depositPerGuest: paise,
  isActive: z.boolean(),
};
export const createSlotBody = z.object({
  ...slotFields,
  maxPartySize: slotFields.maxPartySize.default(BOOKING.DEFAULT_MAX_PARTY),
  daysOfWeek: slotFields.daysOfWeek.default([0, 1, 2, 3, 4, 5, 6]),
  depositPerGuest: slotFields.depositPerGuest.default(0),
  isActive: slotFields.isActive.default(true),
});
export const updateSlotBody = z
  .object(slotFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
