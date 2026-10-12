import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/Category.js';
import { BookingSlot } from '../src/models/BookingSlot.js';
import { Coupon } from '../src/models/Coupon.js';
import { DeliveryZone } from '../src/models/DeliveryZone.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { User } from '../src/models/User.js';
import { slugify } from '../src/utils/slugify.js';
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

const CATALOG = [
  [
    'Chai',
    'Kulhad and classic chai',
    [
      [
        'Masala Chai',
        true,
        2000,
        [
          ['Cutting', 1500],
          ['Full', 2000],
        ],
      ],
      ['Adrak Chai', true, 2000],
      ['Kulhad Chai', true, 3000],
    ],
  ],
  [
    'Snacks',
    'Quick bites',
    [
      ['Bun Maska', true, 4000],
      ['Samosa (2 pcs)', true, 3000],
      ['Veg Sandwich', true, 8000],
    ],
  ],
  [
    'Fast Food',
    'Dinner favourites',
    [
      ['Veg Burger', true, 9000],
      ['Chicken Burger', false, 12000],
      ['Peri Peri Fries', true, 10000],
    ],
  ],
];

async function seedCatalog() {
  for (const [i, [name, description, items]] of CATALOG.entries()) {
    const slug = slugify(name);
    const cat = await Category.findOneAndUpdate(
      { slug },
      { $setOnInsert: { name, slug, description, sortOrder: i } },
      { upsert: true, returnDocument: 'after' },
    );
    for (const [j, [itemName, isVeg, price, variants]] of items.entries()) {
      await MenuItem.updateOne(
        { slug: slugify(itemName) },
        {
          $setOnInsert: {
            name: itemName,
            slug: slugify(itemName),
            categoryId: cat._id,
            isVeg,
            price,
            sortOrder: j,
            ...(variants ? { variants: variants.map(([n, p]) => ({ name: n, price: p })) } : {}),
          },
        },
        { upsert: true },
      );
    }
  }
  console.log('catalog seeded');
}

async function seedZonesAndCoupons() {
  const zones = [
    {
      name: 'Indore Central (pincodes)',
      kind: 'pincode',
      pincodes: ['452001', '452002', '452003', '452010'],
      deliveryCharge: 2500,
      freeDeliveryAbove: 50000,
      minOrderAmount: 10000,
      estimatedMinutes: 30,
    },
    {
      name: 'Nearby (0-3 km)',
      kind: 'distance',
      minKm: 0,
      maxKm: 3,
      deliveryCharge: 2000,
      freeDeliveryAbove: 50000,
      estimatedMinutes: 30,
    },
    {
      name: 'City (3-7 km)',
      kind: 'distance',
      minKm: 3,
      maxKm: 7,
      deliveryCharge: 4000,
      freeDeliveryAbove: 80000,
      minOrderAmount: 20000,
      estimatedMinutes: 45,
    },
  ];
  for (const z of zones)
    await DeliveryZone.updateOne({ name: z.name }, { $setOnInsert: z }, { upsert: true });
  await Coupon.updateOne(
    { code: 'WELCOME20' },
    {
      $setOnInsert: {
        code: 'WELCOME20',
        description: '20% off up to Rs 100',
        type: 'percent',
        value: 20,
        maxDiscount: 10000,
        minOrderAmount: 15000,
        isPublic: true,
      },
    },
    { upsert: true },
  );
  console.log('zones and coupons seeded');
}

async function seedSlots() {
  const slots = [
    { label: 'Lunch', startTime: '12:30', endTime: '14:30', capacity: 30, maxPartySize: 8 },
    { label: 'Dinner', startTime: '19:00', endTime: '20:30', capacity: 40, maxPartySize: 10 },
    { label: 'Late dinner', startTime: '20:30', endTime: '22:00', capacity: 40, maxPartySize: 10 },
    {
      label: 'Weekend special',
      startTime: '21:00',
      endTime: '23:00',
      capacity: 30,
      maxPartySize: 8,
      daysOfWeek: [5, 6, 0],
      depositPerGuest: 10000,
    },
  ];
  for (const s of slots)
    await BookingSlot.updateOne({ label: s.label }, { $setOnInsert: s }, { upsert: true });
  console.log('booking slots seeded');
}

await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
try {
  await User.init();
  await Promise.all([Category.init(), MenuItem.init(), DeliveryZone.init(), Coupon.init()]);
  await seedAdmin();
  await seedCatalog();
  await seedZonesAndCoupons();
  await seedSlots();
} finally {
  await mongoose.disconnect();
}
