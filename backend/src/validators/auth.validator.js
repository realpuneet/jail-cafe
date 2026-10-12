import { z } from 'zod';
import { phoneSchema } from './common.js';

export const requestOtpBody = z.object({ phone: phoneSchema });

export const verifyOtpBody = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  name: z.string().trim().min(1).max(80).optional(),
});

export const passwordLoginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(128),
});
