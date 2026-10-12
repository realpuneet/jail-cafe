import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '../utils/constants.js';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Accept a well-formed inbound id (from an LB/gateway) or mint one; echo it on the response. */
export const requestId = (req, res, next) => {
  const inbound = req.headers[REQUEST_ID_HEADER];
  req.id = typeof inbound === 'string' && SAFE_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
};
