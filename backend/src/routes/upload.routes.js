import { Router } from 'express';
import * as c from '../controllers/upload.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { fileIdParams, uploadAuthQuery } from '../validators/upload.validator.js';

const router = Router();
router.use(authenticate);

router.get('/auth', validate({ query: uploadAuthQuery }), c.authParams);
router.delete('/:fileId', authorize(ROLES.ADMIN), validate({ params: fileIdParams }), c.remove);

export default router;
