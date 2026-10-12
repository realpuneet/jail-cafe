import { z } from 'zod';
import { ROLE_VALUES, ROLES } from '../utils/constants.js';
import { cursorQuery, imageSchema, phoneSchema } from './common.js';

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().toLowerCase().email().max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const avatarBody = imageSchema;

export const listUsersQuery = cursorQuery.extend({
  role: z.enum(ROLE_VALUES).optional(),
  search: z.string().trim().min(3).max(15).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const createStaffBody = z.object({
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(10).max(128),
  role: z.enum([ROLES.ADMIN, ROLES.STAFF, ROLES.RIDER]),
});

export const roleBody = z.object({ role: z.enum(ROLE_VALUES) });
export const statusBody = z.object({ isActive: z.boolean() });
