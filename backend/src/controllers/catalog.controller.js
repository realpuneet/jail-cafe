import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as categories from '../services/category.service.js';
import * as menu from '../services/menu.service.js';
import * as banners from '../services/banner.service.js';
import * as zones from '../services/deliveryZone.service.js';
import * as coupons from '../services/coupon.service.js';

const page = (res, { items, meta }) => ApiResponse.ok(res, items, 'OK', meta);

export const category = {
  list: asyncHandler(async (_req, res) => ApiResponse.ok(res, await categories.listPublic())),
  listAdmin: asyncHandler(async (req, res) => page(res, await categories.listAdmin(req.query))),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await categories.create(req.body), 'Category created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await categories.update(req.params.id, req.body), 'Category updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await categories.remove(req.params.id);
    ApiResponse.ok(res, null, 'Category removed');
  }),
};

export const menuItem = {
  list: asyncHandler(async (req, res) => {
    const items = await menu.listPublic(req.query);
    ApiResponse.ok(res, items, 'OK', { count: items.length });
  }),
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await menu.getPublic(req.params.idOrSlug)),
  ),
  listAdmin: asyncHandler(async (req, res) => page(res, await menu.listAdmin(req.query))),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await menu.create(req.body), 'Menu item created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await menu.update(req.params.id, req.body), 'Menu item updated'),
  ),
  setAvailability: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await menu.setAvailability(req.params.id, req.body.isAvailable),
      'Availability updated',
    ),
  ),
  remove: asyncHandler(async (req, res) => {
    await menu.remove(req.params.id);
    ApiResponse.ok(res, null, 'Menu item removed');
  }),
};

export const banner = {
  list: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await banners.listPublic(req.query.position)),
  ),
  listAdmin: asyncHandler(async (req, res) => page(res, await banners.listAdmin(req.query))),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await banners.create(req.body), 'Banner created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await banners.update(req.params.id, req.body), 'Banner updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await banners.remove(req.params.id);
    ApiResponse.ok(res, null, 'Banner deleted');
  }),
};

export const zone = {
  list: asyncHandler(async (_req, res) => ApiResponse.ok(res, await zones.listPublic())),
  listAdmin: asyncHandler(async (_req, res) => ApiResponse.ok(res, await zones.listAdmin())),
  quote: asyncHandler(async (req, res) => ApiResponse.ok(res, await zones.quote(req.body))),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await zones.create(req.body), 'Zone created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await zones.update(req.params.id, req.body), 'Zone updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await zones.remove(req.params.id);
    ApiResponse.ok(res, null, 'Zone removed');
  }),
};

export const coupon = {
  listPublic: asyncHandler(async (_req, res) => ApiResponse.ok(res, await coupons.listPublic())),
  listAdmin: asyncHandler(async (req, res) => page(res, await coupons.listAdmin(req.query))),
  validate: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await coupons.validate(req.user.id, req.body.code, req.body.subtotal),
      'Coupon applied',
    ),
  ),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await coupons.create(req.body), 'Coupon created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await coupons.update(req.params.id, req.body), 'Coupon updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await coupons.remove(req.params.id);
    ApiResponse.ok(res, null, 'Coupon deactivated');
  }),
};
