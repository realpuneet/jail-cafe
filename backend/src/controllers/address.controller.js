import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as addressService from '../services/address.service.js';

export const list = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await addressService.list(req.user.id)),
);
export const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await addressService.create(req.user.id, req.body), 'Address saved'),
);
export const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    await addressService.update(req.user.id, req.params.id, req.body),
    'Address updated',
  ),
);
export const setDefault = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    await addressService.setDefault(req.user.id, req.params.id),
    'Default address set',
  ),
);
export const remove = asyncHandler(async (req, res) => {
  await addressService.remove(req.user.id, req.params.id);
  ApiResponse.ok(res, null, 'Address deleted');
});
