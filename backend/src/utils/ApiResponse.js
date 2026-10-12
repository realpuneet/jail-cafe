import { HTTP_STATUS } from './constants.js';

/**
 * Uniform success envelope: { success, message, data, meta }.
 */
export class ApiResponse {
  constructor({ statusCode = HTTP_STATUS.OK, message = 'OK', data = null, meta = null } = {}) {
    this.statusCode = statusCode;
    this.body = { success: true, message, data, meta };
  }

  /** @param {import('express').Response} res */
  send(res) {
    return res.status(this.statusCode).json(this.body);
  }

  static ok(res, data = null, message = 'OK', meta = null) {
    return new ApiResponse({ data, message, meta }).send(res);
  }

  static created(res, data = null, message = 'Created', meta = null) {
    return new ApiResponse({ statusCode: HTTP_STATUS.CREATED, data, message, meta }).send(res);
  }
}
