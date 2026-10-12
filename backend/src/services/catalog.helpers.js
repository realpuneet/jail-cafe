import { assertOwnImage } from '../integrations/imagekit.service.js';

/** Validate any image fields on a payload (only our ImageKit urls, only whitelisted keys). */
export function sanitizeImages(payload) {
  const out = { ...payload };
  if (out.image) out.image = assertOwnImage(out.image);
  if (out.gallery) out.gallery = out.gallery.map(assertOwnImage);
  return out;
}
