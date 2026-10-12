import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

/** WhatsApp Cloud API (Meta) text messages. Mutable object for test stubbing. */
export const whatsappService = {
  isConfigured: () => Boolean(env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN),

  /**
   * @param {string} phone E.164 (+91...)
   * @param {string} text
   * @returns {Promise<boolean>} true if sent, false if the channel is not configured
   */
  async sendText(phone, text) {
    if (!this.isConfigured()) {
      logger.debug({ channel: 'whatsapp' }, 'whatsapp not configured, skipping');
      return false;
    }
    const res = await fetch(env.WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace('+', ''),
        type: 'text',
        text: { body: text },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new ApiError(502, `WhatsApp provider responded ${res.status}`);
    return true;
  },
};
