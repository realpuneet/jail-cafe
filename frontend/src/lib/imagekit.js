import { env } from './env.js';

/** Widths used for responsive srcset generation. */
export const IMAGE_WIDTHS = [320, 480, 640, 960, 1280];

const isImageKitUrl = (url) => Boolean(url) && /^https?:\/\/ik\.imagekit\.io\//.test(url);

/**
 * Add ImageKit transformations (resize, quality, auto format) to an ImageKit URL.
 * Non-ImageKit URLs are returned unchanged.
 * @param {string} url
 * @param {{width?: number, height?: number, quality?: number, crop?: boolean}} [opts]
 */
export function ikUrl(url, { width, height, quality = 75, crop = false } = {}) {
  if (!isImageKitUrl(url)) return url;
  const parts = [];
  if (width) parts.push(`w-${width}`);
  if (height) parts.push(`h-${height}`);
  if (crop && width && height) parts.push('c-maintain_ratio');
  parts.push(`q-${quality}`, 'f-auto');
  const u = new URL(url);
  u.searchParams.set('tr', parts.join(','));
  return u.toString();
}

/** srcset string for an ImageKit URL, e.g. "...w-320... 320w, ...w-480... 480w". */
export function ikSrcSet(url, widths = IMAGE_WIDTHS, opts = {}) {
  if (!isImageKitUrl(url)) return undefined;
  return widths.map((w) => `${ikUrl(url, { ...opts, width: w })} ${w}w`).join(', ');
}

export { isImageKitUrl };
export const imagekitEndpoint = env.imagekitEndpoint;
