import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as slots from '../services/bookingSlot.service.js';
import * as bookings from '../services/tableBooking.service.js';

const page = (res, { items, meta }) => ApiResponse.ok(res, items, 'OK', meta);

export const slot = {
  availability: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await slots.availability(req.query.date)),
  ),
  listAdmin: asyncHandler(async (_req, res) => ApiResponse.ok(res, await slots.listAdmin())),
  create: asyncHandler(async (req, res) =>
    ApiResponse.created(res, await slots.create(req.body), 'Slot created'),
  ),
  update: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await slots.update(req.params.id, req.body), 'Slot updated'),
  ),
  remove: asyncHandler(async (req, res) => {
    await slots.remove(req.params.id);
    ApiResponse.ok(res, null, 'Slot disabled');
  }),
};

export const booking = {
  create: asyncHandler(async (req, res) => {
    const { booking: b, replayed } = await bookings.createBooking(
      req.user.id,
      req.body,
      req.idempotencyKey,
    );
    return replayed
      ? ApiResponse.ok(res, b, 'Booking already created')
      : ApiResponse.created(
          res,
          b,
          b.status === 'HELD' ? 'Seats held. Pay the deposit to confirm.' : 'Table booked',
        );
  }),
  mine: asyncHandler(async (req, res) =>
    page(res, await bookings.listMine(req.user.id, req.query)),
  ),
  get: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await bookings.getForActor(req.params.id, req.user)),
  ),
  pay: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await bookings.createDepositPayment(req.user.id, req.params.id),
      'Payment ready',
    ),
  ),
  cancel: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await bookings.cancel(req.params.id, req.user, req.body),
      'Booking cancelled',
    ),
  ),
  staffList: asyncHandler(async (req, res) => page(res, await bookings.listForStaff(req.query))),
  calendar: asyncHandler(async (req, res) =>
    ApiResponse.ok(res, await bookings.calendar(req.query.month)),
  ),
  outcome: asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await bookings.setOutcome(req.params.id, req.body.status, req.user),
      'Booking updated',
    ),
  ),
};
