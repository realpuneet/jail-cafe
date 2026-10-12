import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as packages from '../services/partyPackage.service.js';
import * as inquiries from '../services/partyInquiry.service.js';

const page = (res, { items, meta }) => ApiResponse.ok(res, items, 'OK', meta);

export const pkg = {
  list: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await packages.listPublic(req.query.type)),
  ),
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await packages.getPublic(req.params.slug)),
  ),
  listAdmin: asyncHandler(async (req, res) => page(res, await packages.listAdmin(req.query))),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await packages.create(req.body), 'Package created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await packages.update(req.params.id, req.body), 'Package updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await packages.remove(req.params.id);
    ApiResponse.ok(res, null, 'Package removed');
  }),
};

export const inquiry = {
  create: asyncHandler(async (req, res) => {
    const { inquiry: i, replayed } = await inquiries.createInquiry(
      req.user.id,
      req.body,
      req.idempotencyKey,
    );
    return replayed
      ? ApiResponse.ok(res, i, 'Inquiry already received')
      : ApiResponse.created(res, i, 'Inquiry received');
  }),
  mine: asyncHandler(async (req, res) =>
    page(res, await inquiries.listMine(req.user.id, req.query)),
  ),
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.getForActor(req.params.id, req.user)),
  ),
  accept: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.accept(req.params.id, req.user.id), 'Quote accepted'),
  ),
  decline: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.decline(req.params.id, req.user.id), 'Quote declined'),
  ),
  pay: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await inquiries.createTokenPayment(req.user.id, req.params.id),
      'Payment ready',
    ),
  ),
  cancel: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.cancel(req.params.id, req.user, req.body), 'Cancelled'),
  ),
  staffList: asyncHandler(async (req, res) => page(res, await inquiries.listForStaff(req.query))),
  quote: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.sendQuote(req.params.id, req.body, req.user), 'Quote sent'),
  ),
  close: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await inquiries.close(req.params.id, req.body.reason, req.user),
      'Inquiry closed',
    ),
  ),
  complete: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await inquiries.complete(req.params.id, req.user), 'Marked completed'),
  ),
};
