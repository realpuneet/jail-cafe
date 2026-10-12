import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { imagekitService } from '../../src/integrations/imagekit.service.js';
import { captureOtps, createStaffUser, loginCustomer } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

let app;
const api = (p) => `/api/v1${p}`;

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  imagekitService.getAuthParams = jest.fn(() => ({
    token: 't',
    expire: 1,
    signature: 's',
    publicKey: 'pk',
    urlEndpoint: 'https://ik.imagekit.io/test',
  }));
  imagekitService.remove = jest.fn(async () => {});
  imagekitService.isOwnUrl = (u) => u.startsWith('https://ik.imagekit.io/test/');
});

describe('uploads', () => {
  it('customers may only request avatar upload params; staff can use other folders', async () => {
    const codes = captureOtps();
    const { accessToken } = await loginCustomer(app, codes);
    const c = { Authorization: `Bearer ${accessToken}` };
    const ok = await request(app).get(api('/uploads/auth?folder=avatars')).set(c).expect(200);
    expect(ok.body.data).toMatchObject({ token: 't', signature: 's', folder: 'avatars' });
    expect(ok.headers['cache-control']).toBe('no-store');
    await request(app).get(api('/uploads/auth?folder=menu')).set(c).expect(403);
    await request(app).get(api('/uploads/auth?folder=nope')).set(c).expect(422);

    await createStaffUser();
    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: 'Sup3rSecret!!' });
    const a = { Authorization: `Bearer ${login.body.data.accessToken}` };
    await request(app).get(api('/uploads/auth?folder=menu')).set(a).expect(200);
    await request(app).delete(api('/uploads/file123')).set(c).expect(403);
    await request(app).delete(api('/uploads/file123')).set(a).expect(200);
    expect(imagekitService.remove).toHaveBeenCalledWith('file123');
  });

  it('stores only whitelisted avatar fields and rejects foreign urls', async () => {
    const codes = captureOtps();
    const { accessToken } = await loginCustomer(app, codes);
    const c = { Authorization: `Bearer ${accessToken}` };
    const img = {
      fileId: 'f1',
      url: 'https://ik.imagekit.io/test/jailkichai/avatars/a.jpg',
      filePath: '/jailkichai/avatars/a.jpg',
      thumbnailUrl: 'https://ik.imagekit.io/test/tr:n-ik_ml_thumbnail/a.jpg',
    };
    const res = await request(app)
      .put(api('/users/me/avatar'))
      .set(c)
      .send({ ...img, evil: 'x' })
      .expect(200);
    expect(res.body.data.avatar).toEqual(img);
    await request(app)
      .put(api('/users/me/avatar'))
      .set(c)
      .send({ ...img, url: 'https://evil.example/a.jpg' })
      .expect(400);
  });
});
