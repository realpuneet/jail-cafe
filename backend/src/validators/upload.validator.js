import { z } from 'zod';
import { UPLOAD_FOLDERS } from '../utils/constants.js';

export const uploadAuthQuery = z.object({ folder: z.enum(UPLOAD_FOLDERS).default('misc') });
export const fileIdParams = z.object({ fileId: z.string().min(1).max(100) });
