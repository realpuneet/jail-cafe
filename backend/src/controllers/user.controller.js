import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as userService from '../services/user.service.js';

export const me = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await userService.getById(req.user.id)),
);
export const updateMe = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await userService.updateProfile(req.user.id, req.body), 'Profile updated'),
);
export const setAvatar = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await userService.setAvatar(req.user.id, req.body), 'Avatar updated'),
);
export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.list(req.query);
  ApiResponse.ok(res, items, 'OK', meta);
});
export const getOne = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await userService.getById(req.params.id)),
);
export const createStaff = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await userService.createStaff(req.body), 'User created'),
);
export const setRole = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    await userService.setRole(req.user.id, req.params.id, req.body.role),
    'Role updated',
  ),
);
export const setActive = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    await userService.setActive(req.user.id, req.params.id, req.body.isActive),
    'Status updated',
  ),
);
