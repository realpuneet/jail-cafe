import { Router } from 'express';
import * as c from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/constants.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/user.validator.js';

const router = Router();
router.use(authenticate);

router.get('/me', c.me);
router.patch('/me', validate({ body: v.updateProfileBody }), c.updateMe);
router.put('/me/avatar', validate({ body: v.avatarBody }), c.setAvatar);

const admin = authorize(ROLES.ADMIN);
router.get('/', authorize(ROLES.ADMIN, ROLES.STAFF), validate({ query: v.listUsersQuery }), c.list);
router.post('/', admin, validate({ body: v.createStaffBody }), c.createStaff);
router.get('/:id', authorize(ROLES.ADMIN, ROLES.STAFF), validate({ params: idParams }), c.getOne);
router.patch('/:id/role', admin, validate({ params: idParams, body: v.roleBody }), c.setRole);
router.patch('/:id/status', admin, validate({ params: idParams, body: v.statusBody }), c.setActive);

export default router;
