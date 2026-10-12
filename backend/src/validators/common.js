import { z } from 'zod';
import { Types } from 'mongoose';
import { normalizePhone } from '../utils/phone.js';

export const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

export const phoneSchema = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' });
  return n ?? z.NEVER;
});

export const idParams = z.object({ id: objectId });

export const cursorQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});

export const imageSchema = z.object({
  fileId: z.string().min(1).max(100),
  url: z.string().url().max(500),
  filePath: z.string().min(1).max(300),
  thumbnailUrl: z.string().url().max(500).optional(),
});
