import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as uploadService from '../services/upload.service.js';

export const authParams = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  ApiResponse.ok(res, uploadService.getUploadAuth(req.user, req.query.folder));
});
export const remove = asyncHandler(async (req, res) => {
  await uploadService.deleteFile(req.params.fileId);
  ApiResponse.ok(res, null, 'File deleted');
});
