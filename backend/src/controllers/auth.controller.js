import { TOKEN } from '../utils/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { clearRefreshCookie, setRefreshCookie } from '../utils/cookies.js';
import * as authService from '../services/auth.service.js';
import * as otpService from '../services/otp.service.js';

const meta = (req) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

const sendSession = (res, { user, accessToken, refreshToken }, message) => {
  setRefreshCookie(res, refreshToken);
  return ApiResponse.ok(res, { user, accessToken }, message);
};

export const requestOtp = asyncHandler(async (req, res) => {
  const data = await otpService.requestOtp(req.body.phone);
  ApiResponse.ok(res, data, 'OTP sent');
});

export const verifyOtp = asyncHandler(async (req, res) => {
  sendSession(res, await authService.loginWithOtp(req.body, meta(req)), 'Logged in');
});

export const passwordLogin = asyncHandler(async (req, res) => {
  sendSession(res, await authService.loginWithPassword(req.body, meta(req)), 'Logged in');
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const session = await authService.refresh(req.cookies?.[TOKEN.REFRESH_COOKIE], meta(req));
    sendSession(res, session, 'Token refreshed');
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[TOKEN.REFRESH_COOKIE]);
  clearRefreshCookie(res);
  ApiResponse.ok(res, null, 'Logged out');
});
