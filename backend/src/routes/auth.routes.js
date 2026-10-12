import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.js';
import { passwordLoginBody, requestOtpBody, verifyOtpBody } from '../validators/auth.validator.js';

const router = Router();
const limiter = authLimiter();

router.post('/otp/request', limiter, validate({ body: requestOtpBody }), c.requestOtp);
router.post('/otp/verify', limiter, validate({ body: verifyOtpBody }), c.verifyOtp);
router.post('/login', limiter, validate({ body: passwordLoginBody }), c.passwordLogin);
router.post('/refresh', limiter, c.refresh);
router.post('/logout', c.logout);

export default router;
