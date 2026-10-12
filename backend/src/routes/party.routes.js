import { Router } from 'express';
import * as c from '../controllers/party.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { idempotency } from '../middlewares/idempotency.js';
import { publicCache } from '../middlewares/publicCache.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { cursorQuery, idParams } from '../validators/common.js';
import * as v from '../validators/party.validator.js';

const { ADMIN, STAFF, CUSTOMER } = ROLES;
const admin = [authenticate, authorize(ADMIN)];
const staff = [authenticate, authorize(ADMIN, STAFF)];
const customer = [authenticate, authorize(CUSTOMER)];

export const packageRoutes = Router();
packageRoutes.get('/', publicCache(), validate({ query: v.publicPackagesQuery }), c.pkg.list);
packageRoutes.get('/manage', ...staff, validate({ query: cursorQuery }), c.pkg.listAdmin);
packageRoutes.get('/:slug', publicCache(), validate({ params: v.slugParams }), c.pkg.get);
packageRoutes.post('/', ...admin, validate({ body: v.createPackageBody }), c.pkg.create);
packageRoutes.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: v.updatePackageBody }),
  c.pkg.update,
);
packageRoutes.delete('/:id', ...admin, validate({ params: idParams }), c.pkg.remove);

export const inquiryRoutes = Router();
inquiryRoutes.post(
  '/',
  ...customer,
  validate({ body: v.createInquiryBody }),
  idempotency({ required: true }),
  c.inquiry.create,
);
inquiryRoutes.get('/', ...customer, validate({ query: cursorQuery }), c.inquiry.mine);
inquiryRoutes.get(
  '/manage',
  ...staff,
  validate({ query: v.staffInquiriesQuery }),
  c.inquiry.staffList,
);
inquiryRoutes.get('/:id', authenticate, validate({ params: idParams }), c.inquiry.get);
inquiryRoutes.post('/:id/accept', ...customer, validate({ params: idParams }), c.inquiry.accept);
inquiryRoutes.post('/:id/decline', ...customer, validate({ params: idParams }), c.inquiry.decline);
inquiryRoutes.post(
  '/:id/pay',
  ...customer,
  validate({ params: idParams }),
  idempotency(),
  c.inquiry.pay,
);
inquiryRoutes.post(
  '/:id/cancel',
  authenticate,
  validate({ params: idParams, body: v.cancelBody }),
  c.inquiry.cancel,
);
inquiryRoutes.patch(
  '/:id/quote',
  ...staff,
  validate({ params: idParams, body: v.quoteBody }),
  c.inquiry.quote,
);
inquiryRoutes.post(
  '/:id/close',
  ...staff,
  validate({ params: idParams, body: v.closeBody }),
  c.inquiry.close,
);
inquiryRoutes.post('/:id/complete', ...staff, validate({ params: idParams }), c.inquiry.complete);
