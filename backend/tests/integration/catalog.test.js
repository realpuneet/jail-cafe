import request from 'supertest';
import mongooseRef from 'mongoose';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { imagekitService } from '../../src/integrations/imagekit.service.js';
import { Coupon } from '../../src/models/Coupon.js';
import { MenuItem } from '../../src/models/MenuItem.js';
import * as couponService from '../../src/services/coupon.service.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

let app;
let admin;
let staff;
let customer;
const api = (p) => `/api/v1${p}`;
const img = (n = 'a') => ({
  fileId: `f-${n}`,
  url: `https://ik.imagekit.io/test/jailkichai/menu/${n}.jpg`,
  filePath: `/jailkichai/menu/${n}.jpg`,
});

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  imagekitService.isOwnUrl = (u) => u.startsWith('https://ik.imagekit.io/test/');
  admin = await staffAuth(app, 'admin');
  staff = await staffAuth(app, 'staff');
  const { accessToken } = await loginCustomer(app, captureOtps());
  customer = { Authorization: `Bearer ${accessToken}` };
});

const mkCategory = (name = 'Chai', extra = {}) =>
  request(app)
    .post(api('/categories'))
    .set(admin)
    .send({ name, sortOrder: 1, ...extra })
    .expect(201)
    .then((r) => r.body.data);
const mkItem = (categoryId, extra = {}) =>
  request(app)
    .post(api('/menu-items'))
    .set(admin)
    .send({ name: 'Masala Chai', categoryId, isVeg: true, price: 2000, ...extra })
    .expect(201)
    .then((r) => r.body.data);

describe('categories + menu', () => {
  it('RBAC: only admin writes; staff can toggle stock; customers cannot', async () => {
    const cat = await mkCategory();
    const item = await mkItem(cat._id);
    await request(app).post(api('/categories')).set(customer).send({ name: 'X' }).expect(403);
    await request(app).post(api('/categories')).send({ name: 'X' }).expect(401);
    await request(app)
      .patch(api(`/menu-items/${item._id}`))
      .set(staff)
      .send({ price: 1 })
      .expect(403);
    await request(app)
      .patch(api(`/menu-items/${item._id}/availability`))
      .set(customer)
      .send({ isAvailable: false })
      .expect(403);
    const r = await request(app)
      .patch(api(`/menu-items/${item._id}/availability`))
      .set(staff)
      .send({ isAvailable: false })
      .expect(200);
    expect(r.body.data.isAvailable).toBe(false);
  });

  it('generates unique slugs and filters by veg/category', async () => {
    const chai = await mkCategory('Chai');
    const food = await mkCategory('Snacks');
    const a = await mkItem(chai._id);
    const b = await mkItem(chai._id); // same name
    expect(a.slug).toBe('masala-chai');
    expect(b.slug).toMatch(/^masala-chai-[0-9a-f]{4}$/);
    await mkItem(food._id, { name: 'Chicken Roll', isVeg: false, price: 12000 });

    const all = await request(app).get(api('/menu-items')).expect(200);
    expect(all.body.data).toHaveLength(3);
    const veg = await request(app).get(api('/menu-items?veg=true')).expect(200);
    expect(veg.body.data).toHaveLength(2);
    const nonVeg = await request(app)
      .get(api(`/menu-items?veg=false&category=${food._id}`))
      .expect(200);
    expect(nonVeg.body.data.map((i) => i.name)).toEqual(['Chicken Roll']);
    const one = await request(app)
      .get(api(`/menu-items/${a.slug}`))
      .expect(200);
    expect(one.body.data._id).toBe(a._id);
    await request(app).get(api('/menu-items/does-not-exist')).expect(404);
  });

  it('supports text search', async () => {
    const cat = await mkCategory();
    await mkItem(cat._id, { name: 'Kulhad Chai', tags: ['hot'] });
    await mkItem(cat._id, { name: 'Cold Coffee', tags: ['cold'] });
    await MenuItem.init();
    const res = await request(app).get(api('/menu-items?q=kulhad')).expect(200);
    expect(res.body.data.map((i) => i.name)).toEqual(['Kulhad Chai']);
  });

  it('serves cached public responses, sets HTTP cache headers, and invalidates on admin writes', async () => {
    const cat = await mkCategory();
    const item = await mkItem(cat._id);
    const first = await request(app).get(api('/menu-items')).expect(200);
    expect(first.headers['cache-control']).toMatch(/public, max-age=60/);
    expect(first.headers.etag).toBeTruthy();
    expect(
      (await request(app).get(api('/menu-items')).set('If-None-Match', first.headers.etag)).status,
    ).toBe(304);

    // Direct DB write bypasses invalidation => cached value still served (proves cache is used)
    await MenuItem.updateOne({ _id: item._id }, { price: 9999 });
    expect((await request(app).get(api('/menu-items'))).body.data[0].price).toBe(2000);

    // Admin write invalidates
    await request(app)
      .patch(api(`/menu-items/${item._id}`))
      .set(admin)
      .send({ price: 2500 })
      .expect(200);
    expect((await request(app).get(api('/menu-items'))).body.data[0].price).toBe(2500);
  });

  it('stock-off items remain listed but flagged; soft-deleted items disappear', async () => {
    const cat = await mkCategory();
    const item = await mkItem(cat._id);
    await request(app)
      .patch(api(`/menu-items/${item._id}/availability`))
      .set(staff)
      .send({ isAvailable: false });
    expect((await request(app).get(api('/menu-items'))).body.data[0].isAvailable).toBe(false);
    expect((await request(app).get(api('/menu-items?available=true'))).body.data).toHaveLength(0);
    await request(app)
      .delete(api(`/menu-items/${item._id}`))
      .set(admin)
      .expect(200);
    expect((await request(app).get(api('/menu-items'))).body.data).toHaveLength(0);
    expect((await request(app).get(api('/menu-items/manage')).set(staff)).body.data).toHaveLength(
      1,
    );
  });

  it('validates payloads: unknown category, mrp < price, foreign image, too many variants', async () => {
    const cat = await mkCategory();
    const body = { name: 'Tea', categoryId: cat._id, isVeg: true, price: 1000 };
    await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({ ...body, categoryId: '65f0c0ffee0123456789abcd' })
      .expect(400);
    await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({ ...body, mrp: 500 })
      .expect(422);
    await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({ ...body, price: 10.5 })
      .expect(422);
    await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({ ...body, image: { ...img(), url: 'https://evil.example/x.jpg' } })
      .expect(400);
    const variants = Array.from({ length: 11 }, (_, i) => ({ name: `v${i}`, price: 1 }));
    await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({ ...body, variants })
      .expect(422);
    const ok = await request(app)
      .post(api('/menu-items'))
      .set(admin)
      .send({
        ...body,
        image: img(),
        variants: [
          { name: 'Half', price: 800 },
          { name: 'Full', price: 1500 },
        ],
        addOns: [{ name: 'Extra Ginger', price: 500 }],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.variants[0]._id).toBeTruthy(); // cart can reference variantId
  });

  it('refuses to delete a category with active items', async () => {
    const cat = await mkCategory();
    const item = await mkItem(cat._id);
    await request(app)
      .delete(api(`/categories/${cat._id}`))
      .set(admin)
      .expect(409);
    await request(app)
      .delete(api(`/menu-items/${item._id}`))
      .set(admin)
      .expect(200);
    await request(app)
      .delete(api(`/categories/${cat._id}`))
      .set(admin)
      .expect(200);
    expect((await request(app).get(api('/categories'))).body.data).toHaveLength(0);
  });

  it('PATCH does not reset unspecified fields to defaults', async () => {
    const cat = await mkCategory('Chai', { sortOrder: 7, isActive: true });
    await request(app)
      .patch(api(`/categories/${cat._id}`))
      .set(admin)
      .send({ description: 'hot' })
      .expect(200);
    const list = await request(app).get(api('/categories'));
    expect(list.body.data[0]).toMatchObject({ sortOrder: 7, description: 'hot' });
  });
});

describe('banners', () => {
  it('honours schedule windows and position filter at serve time', async () => {
    const make = (extra) =>
      request(app)
        .post(api('/banners'))
        .set(admin)
        .send({ title: 'B', image: img('b'), ...extra })
        .expect(201);
    const day = 86_400_000;
    await make({ title: 'live' });
    await make({ title: 'future', startsAt: new Date(Date.now() + day) });
    await make({ title: 'past', endsAt: new Date(Date.now() - day) });
    await make({ title: 'menu-banner', position: 'menu' });
    const all = await request(app).get(api('/banners')).expect(200);
    expect(all.body.data.map((b) => b.title).sort()).toEqual(['live', 'menu-banner']);
    const menu = await request(app).get(api('/banners?position=menu'));
    expect(menu.body.data.map((b) => b.title)).toEqual(['menu-banner']);
    await request(app)
      .post(api('/banners'))
      .set(admin)
      .send({ title: 'bad', image: img(), startsAt: '2026-02-01', endsAt: '2026-01-01' })
      .expect(422);
  });

  it('PATCH keeps position and isActive when not provided', async () => {
    const b = await request(app)
      .post(api('/banners'))
      .set(admin)
      .send({ title: 'B', image: img('b'), position: 'party' });
    await request(app)
      .patch(api(`/banners/${b.body.data._id}`))
      .set(admin)
      .send({ title: 'B2' })
      .expect(200);
    const got = await request(app).get(api('/banners?position=party'));
    expect(got.body.data[0]).toMatchObject({ title: 'B2', position: 'party' });
  });
});

describe('delivery zones', () => {
  it('quotes by pincode with free-delivery threshold; 422 for unknown areas', async () => {
    await request(app)
      .post(api('/delivery-zones'))
      .set(admin)
      .send({
        name: 'Central',
        kind: 'pincode',
        pincodes: ['452001', '452002'],
        deliveryCharge: 3000,
        freeDeliveryAbove: 50000,
      })
      .expect(201);
    const q = await request(app)
      .post(api('/delivery-zones/quote'))
      .send({ pincode: '452001', subtotal: 20000 })
      .expect(200);
    expect(q.body.data).toMatchObject({ deliveryCharge: 3000, minOrderAmount: 10000 });
    const free = await request(app)
      .post(api('/delivery-zones/quote'))
      .send({ pincode: '452002', subtotal: 60000 })
      .expect(200);
    expect(free.body.data.deliveryCharge).toBe(0);
    await request(app)
      .post(api('/delivery-zones/quote'))
      .send({ pincode: '110001', subtotal: 100 })
      .expect(422);
    await request(app).post(api('/delivery-zones/quote')).send({ subtotal: 100 }).expect(422);
  });

  it('validates zone shape and reflects admin edits immediately (cache invalidation)', async () => {
    await request(app)
      .post(api('/delivery-zones'))
      .set(admin)
      .send({ name: 'Bad', kind: 'pincode', deliveryCharge: 1 })
      .expect(422);
    await request(app)
      .post(api('/delivery-zones'))
      .set(admin)
      .send({ name: 'Bad', kind: 'distance', minKm: 5, maxKm: 2, deliveryCharge: 1 })
      .expect(422);
    const z = await request(app)
      .post(api('/delivery-zones'))
      .set(admin)
      .send({ name: 'Zone A', kind: 'pincode', pincodes: ['452001'], deliveryCharge: 3000 });
    await request(app)
      .post(api('/delivery-zones/quote'))
      .send({ pincode: '452001', subtotal: 1 })
      .expect(200);
    await request(app)
      .delete(api(`/delivery-zones/${z.body.data._id}`))
      .set(admin)
      .expect(200);
    await request(app)
      .post(api('/delivery-zones/quote'))
      .send({ pincode: '452001', subtotal: 1 })
      .expect(422);
  });
});

describe('coupons', () => {
  const mk = (extra = {}) =>
    request(app)
      .post(api('/coupons'))
      .set(admin)
      .send({
        code: 'chai20',
        type: 'percent',
        value: 20,
        minOrderAmount: 10000,
        maxDiscount: 5000,
        ...extra,
      });

  it('admin-only management; code is uppercased and unique', async () => {
    const r = await mk().expect(201);
    expect(r.body.data.code).toBe('CHAI20');
    await mk().expect(409);
    await request(app)
      .post(api('/coupons'))
      .set(staff)
      .send({ code: 'X1X', type: 'flat', value: 100 })
      .expect(403);
    await mk({ code: 'BAD', value: 150 }).expect(422);
  });

  it('validates a code for a cart with the rule engine', async () => {
    await mk().expect(201);
    const ok = await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'chai20', subtotal: 20000 })
      .expect(200);
    expect(ok.body.data.discount).toBe(4000);
    const capped = await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'CHAI20', subtotal: 100000 });
    expect(capped.body.data.discount).toBe(5000);
    await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'CHAI20', subtotal: 5000 })
      .expect(400);
    await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'NOPE', subtotal: 20000 })
      .expect(400);
    await request(app)
      .post(api('/coupons/validate'))
      .send({ code: 'CHAI20', subtotal: 20000 })
      .expect(401);
  });

  it('lists only public, live coupons', async () => {
    await mk({ code: 'PUBLIC1', isPublic: true }).expect(201);
    await mk({ code: 'HIDDEN1' }).expect(201);
    await mk({
      code: 'OLD1',
      isPublic: true,
      startsAt: '2020-01-01',
      expiresAt: '2020-02-01',
    }).expect(201);
    const res = await request(app).get(api('/coupons')).expect(200);
    expect(res.body.data.map((c) => c.code)).toEqual(['PUBLIC1']);
  });

  it('deactivation is reflected immediately', async () => {
    const c = await mk().expect(201);
    await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'CHAI20', subtotal: 20000 })
      .expect(200);
    await request(app)
      .delete(api(`/coupons/${c.body.data._id}`))
      .set(admin)
      .expect(200);
    await request(app)
      .post(api('/coupons/validate'))
      .set(customer)
      .send({ code: 'CHAI20', subtotal: 20000 })
      .expect(400);
  });

  describe('redeem (atomic)', () => {
    it('total usageLimit holds under concurrency', async () => {
      const coupon = await Coupon.create({
        code: 'ONCE',
        type: 'flat',
        value: 100,
        usageLimit: 3,
        perUserLimit: 5,
      });
      const users = Array.from({ length: 8 }, () => new mongooseRef.Types.ObjectId());
      const results = await Promise.allSettled(
        users.map((userId) =>
          couponService.redeem({
            couponId: coupon._id,
            userId,
            orderId: new mongooseRef.Types.ObjectId(),
            discount: 100,
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect((await Coupon.findById(coupon._id)).usedCount).toBe(3);
    });

    it('perUserLimit holds under concurrency and redeem is idempotent per order', async () => {
      const coupon = await Coupon.create({
        code: 'PERUSER',
        type: 'flat',
        value: 100,
        perUserLimit: 1,
      });
      const userId = new mongooseRef.Types.ObjectId();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          couponService.redeem({
            couponId: coupon._id,
            userId,
            orderId: new mongooseRef.Types.ObjectId(),
            discount: 100,
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);

      const orderId = new mongooseRef.Types.ObjectId();
      const other = new mongooseRef.Types.ObjectId();
      const a = await couponService.redeem({
        couponId: coupon._id,
        userId: other,
        orderId,
        discount: 100,
      });
      const b = await couponService.redeem({
        couponId: coupon._id,
        userId: other,
        orderId,
        discount: 100,
      });
      expect(String(a._id)).toBe(String(b._id));
      expect((await Coupon.findById(coupon._id)).usedCount).toBe(2);
    });
  });
});
