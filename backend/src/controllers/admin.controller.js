import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as analytics from '../services/analytics.service.js';
import * as reviews from '../services/review.service.js';
import * as settings from '../services/settings.service.js';

const page = (res, { items, meta }) => ApiResponse.ok(res, items, 'OK', meta);

export const dashboard = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await analytics.dashboard(req.query.days)),
);
export const getSettings = asyncHandler(async (_req, res) =>
  ApiResponse.ok(res, await settings.getAll()),
);
export const updateSettings = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await settings.update(req.body), 'Settings saved'),
);

export const review = {
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await reviews.create(req.user.id, req.body), 'Thanks for your review'),
  ),
  forOrder: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await reviews.getForOrder(req.user.id, req.params.orderId)),
  ),
  list: asyncHandler(async (req, res) => page(res, await reviews.listPublic(req.query))),
  summary: asyncHandler(async (_req, res) => ApiResponse.ok(res, await reviews.summary())),
  listAdmin: asyncHandler(async (req, res) => page(res, await reviews.listAdmin(req.query))),
  setStatus: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await reviews.setStatus(req.params.id, req.body.status), 'Review updated'),
  ),
};
