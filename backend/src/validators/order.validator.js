import { z } from 'zod';
import {
  CART,
  ORDER,
  ORDER_STATUS_VALUES,
  ORDER_TYPE,
  PAYMENT_METHOD,
} from '../utils/constants.js';
import { cursorQuery, objectId } from './common.js';

export const addCartItemBody = z.object({
  menuItemId: objectId,
  variantId: objectId.optional(),
  addOnIds: z.array(objectId).max(20).default([]),
  quantity: z.number().int().min(1).max(CART.MAX_QTY_PER_LINE).default(1),
  note: z.string().trim().max(140).optional(),
});
export const cartLineParams = z.object({ lineId: objectId });
export const cartQuantityBody = z.object({
  quantity: z.number().int().min(0).max(CART.MAX_QTY_PER_LINE),
});
export const cartCouponBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,20}$/),
});

const checkoutFields = {
  type: z.enum(Object.values(ORDER_TYPE)).default(ORDER_TYPE.DELIVERY),
  addressId: objectId.optional(),
};
export const previewBody = z.object(checkoutFields);
export const placeOrderBody = z.object({
  ...checkoutFields,
  paymentMethod: z.enum(Object.values(PAYMENT_METHOD)),
  note: z.string().trim().max(ORDER.MAX_NOTE_LENGTH).optional(),
});

export const staffOrdersQuery = cursorQuery.extend({
  status: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim().toUpperCase()))
    .pipe(z.array(z.enum(ORDER_STATUS_VALUES)).max(8))
    .optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  includeUnpaid: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const statusBody = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  note: z.string().trim().max(200).optional(),
});
export const cancelBody = z.object({ reason: z.string().trim().max(200).optional() });
export const assignBody = z.object({ riderId: objectId });

export const createGatewayOrderBody = z.object({ orderId: objectId });
export const verifyPaymentBody = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(128),
});

export const markReadBody = z.object({ ids: z.array(objectId).min(1).max(100).optional() });
