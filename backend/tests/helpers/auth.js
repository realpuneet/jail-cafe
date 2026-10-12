import request from 'supertest';
import { jest } from '@jest/globals';
import { smsService } from '../../src/integrations/sms.service.js';
import { hashPassword } from '../../src/services/auth.service.js';
import { User } from '../../src/models/User.js';
import { ROLES } from '../../src/utils/constants.js';

/** Capture OTPs instead of sending SMS. */
export function captureOtps() {
  const codes = new Map();
  smsService.sendOtp = jest.fn(async (phone, otp) => codes.set(phone, otp));
  return codes;
}

export const cookieOf = (res) =>
  (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('jkc_rt='))?.split(';')[0];

/** Full OTP login; returns { accessToken, cookie, user }. */
export async function loginCustomer(app, codes, phone = '9876543210', redis) {
  await redis?.del(`${process.env.REDIS_KEY_PREFIX}otp:cool:+91${phone}`);
  await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ phone, otp: codes.get(`+91${phone}`), name: 'Test User' })
    .expect(200);
  return {
    accessToken: res.body.data.accessToken,
    cookie: cookieOf(res),
    user: res.body.data.user,
  };
}

export async function createStaffUser({
  role = ROLES.ADMIN,
  phone = '+919000000001',
  email = 'admin@test.in',
  password = 'Sup3rSecret!!',
} = {}) {
  return User.create({
    phone,
    email,
    role,
    name: 'Staff',
    passwordHash: await hashPassword(password),
  });
}

/** Create a staff-type user and return Authorization headers. */
export async function staffAuth(app, role = ROLES.ADMIN) {
  const email = `${role}@test.in`;
  const phone = { admin: '+919000000001', staff: '+919000000002', rider: '+919000000003' }[role];
  await createStaffUser({ role, phone, email });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Sup3rSecret!!' });
  return { Authorization: `Bearer ${res.body.data.accessToken}` };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
