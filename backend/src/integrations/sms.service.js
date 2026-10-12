import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * SMS provider adapter (MSG91 OTP API). Exposed as a mutable object so tests can stub it.
 * Without SMS_API_KEY: in non-production the OTP is logged at debug level; in production it throws.
 */
export const smsService = {
  /**
   * @param {string} phone E.164 phone
   * @param {string} otp
   */
  async sendOtp(phone, otp) {
    if (!env.SMS_API_KEY || !env.SMS_TEMPLATE_ID) {
      if (env.isProd) throw new ApiError(503, 'SMS provider not configured');
      logger.debug({ phone, otp }, 'DEV ONLY: OTP not sent (no SMS provider configured)');
      return;
    }
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.search = new URLSearchParams({
      template_id: env.SMS_TEMPLATE_ID,
      mobile: phone.replace('+', ''),
      otp,
    }).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { authkey: env.SMS_API_KEY, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, 'sms provider rejected request');
      throw new ApiError(502, 'Could not send OTP, please try again');
    }
  },
};
