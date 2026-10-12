import { Router } from 'express';
import * as c from '../controllers/address.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParams } from '../validators/common.js';
import { createAddressBody, updateAddressBody } from '../validators/address.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', c.list);
router.post('/', validate({ body: createAddressBody }), c.create);
router.patch('/:id', validate({ params: idParams, body: updateAddressBody }), c.update);
router.put('/:id/default', validate({ params: idParams }), c.setDefault);
router.delete('/:id', validate({ params: idParams }), c.remove);

export default router;
