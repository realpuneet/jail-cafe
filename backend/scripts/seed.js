import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/services/auth.service.js';
import { ROLES } from '../src/utils/constants.js';

/** Idempotent seed. Later phases append categories, menu, zones, packages and slots here. */
async function seedAdmin() {
  if (!env.SEED_ADMIN_PASSWORD || env.SEED_ADMIN_PASSWORD.length < 10) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 10 chars) to seed the admin user');
  }
  const existing = await User.findOne({ email: env.SEED_ADMIN_EMAIL }, '_id').lean();
  if (existing) return console.log(`admin exists: ${env.SEED_ADMIN_EMAIL}`);
  await User.create({
    name: 'Admin',
    phone: '+910000000000',
    email: env.SEED_ADMIN_EMAIL,
    role: ROLES.ADMIN,
    passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
  });
  console.log(`admin created: ${env.SEED_ADMIN_EMAIL}`);
}

await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
try {
  await User.init();
  await seedAdmin();
} finally {
  await mongoose.disconnect();
}
