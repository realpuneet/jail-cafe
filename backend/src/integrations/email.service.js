import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transport;
const getTransport = () =>
  (transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  }));

/** SMTP email. Mutable object for test stubbing. */
export const emailService = {
  isConfigured: () => Boolean(env.SMTP_HOST && env.MAIL_FROM),

  /**
   * @param {{to: string, subject: string, text: string}} m
   * @returns {Promise<boolean>} true if sent, false if the channel is not configured
   */
  async send({ to, subject, text }) {
    if (!this.isConfigured()) {
      logger.debug({ channel: 'email' }, 'email not configured, skipping');
      return false;
    }
    await getTransport().sendMail({ from: env.MAIL_FROM, to, subject, text });
    return true;
  },
};
