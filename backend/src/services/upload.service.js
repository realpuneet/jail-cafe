import { imagekitService } from '../integrations/imagekit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES, UPLOAD_FOLDERS } from '../utils/constants.js';

const STAFF_ROLES = [ROLES.ADMIN, ROLES.STAFF];

/**
 * Signed ImageKit params for a direct browser upload. Customers may only target `avatars`.
 * @param {{role: string}} user
 * @param {string} [folder]
 */
export function getUploadAuth(user, folder = 'misc') {
  if (!UPLOAD_FOLDERS.includes(folder)) throw ApiError.badRequest('Invalid upload folder');
  if (!STAFF_ROLES.includes(user.role) && folder !== 'avatars') throw ApiError.forbidden();
  return { ...imagekitService.getAuthParams(), folder };
}

/** Admin: delete an ImageKit file by id. @param {string} fileId */
export const deleteFile = (fileId) => imagekitService.remove(fileId);
