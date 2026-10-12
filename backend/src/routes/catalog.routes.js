import { Router } from 'express';
import * as c from '../controllers/catalog.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { publicCache } from '../middlewares/publicCache.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { cursorQuery, idParams } from '../validators/common.js';
import * as v from '../validators/catalog.validator.js';

const { ADMIN, STAFF } = ROLES;
const admin = [authenticate, authorize(ADMIN)];
const staff = [authenticate, authorize(ADMIN, STAFF)];

export const categoryRoutes = Router();
categoryRoutes.get('/', publicCache(), c.category.list);
categoryRoutes.get('/manage', ...staff, validate({ query: cursorQuery }), c.category.listAdmin);
categoryRoutes.post('/', ...admin, validate({ body: v.createCategoryBody }), c.category.create);
categoryRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateCategoryBody }),
  c.category.update,
);
categoryRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.category.remove);

export const menuRoutes = Router();
menuRoutes.get('/', publicCache(), validate({ query: v.publicMenuQuery }), c.menuItem.list);
menuRoutes.get('/manage', ...staff, validate({ query: v.adminMenuQuery }), c.menuItem.listAdmin);
menuRoutes.get('/:idOrSlug', publicCache(), validate({ params: v.slugOrIdParams }), c.menuItem.get);
menuRoutes.post('/', ...admin, validate({ body: v.createMenuItemBody }), c.menuItem.create);
menuRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateMenuItemBody }),
  c.menuItem.update,
);
menuRoutes.patch(
  '/:id/availability',
  ...staff,
  validate({ params: idParams, body: v.availabilityBody }),
  c.menuItem.setAvailability,
);
menuRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.menuItem.remove);

export const bannerRoutes = Router();
bannerRoutes.get('/', publicCache(30, 60), validate({ query: v.publicBannerQuery }), c.banner.list);
bannerRoutes.get('/manage', ...staff, validate({ query: cursorQuery }), c.banner.listAdmin);
bannerRoutes.post('/', ...admin, validate({ body: v.createBannerBody }), c.banner.create);
bannerRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateBannerBody }),
  c.banner.update,
);
bannerRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.banner.remove);

export const zoneRoutes = Router();
zoneRoutes.get('/', publicCache(), c.zone.list);
zoneRoutes.post('/quote', validate({ body: v.quoteBody }), c.zone.quote);
zoneRoutes.get('/manage', ...staff, c.zone.listAdmin);
zoneRoutes.post('/', ...admin, validate({ body: v.createZoneBody }), c.zone.create);
zoneRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateZoneBody }),
  c.zone.update,
);
zoneRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.zone.remove);

export const couponRoutes = Router();
couponRoutes.get('/', publicCache(30, 60), c.coupon.listPublic);
couponRoutes.post(
  '/validate',
  authenticate,
  validate({ body: v.validateCouponBody }),
  c.coupon.validate,
);
couponRoutes.get('/manage', ...admin, validate({ query: cursorQuery }), c.coupon.listAdmin);
couponRoutes.post('/', ...admin, validate({ body: v.createCouponBody }), c.coupon.create);
couponRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updateCouponBody }),
  c.coupon.update,
);
couponRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.coupon.remove);
