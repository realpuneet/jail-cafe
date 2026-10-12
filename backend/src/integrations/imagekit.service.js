import ImageKit from 'imagekit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let client;
const getClient = () => {
  if (!env.IMAGEKIT_PUBLIC_KEY || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    throw new ApiError(503, 'Image storage is not configured');
  }
  client ??= new ImageKit({
    publicKey: env.IMAGEKIT_PUBLIC_KEY,
    privateKey: env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
  });
  return client;
};

/** Reduce an ImageKit response to the only fields we persist. */
export const toStoredImage = (r) => ({
  fileId: r.fileId,
  url: r.url,
  filePath: r.filePath,
  thumbnailUrl: r.thumbnailUrl,
});

/** Mutable object so tests can stub it. */
export const imagekitService = {
  /** Signed params for browser-side uploads (token, expire, signature). */
  getAuthParams() {
    return {
      ...getClient().getAuthenticationParameters(),
      publicKey: env.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
    };
  },

  /**
   * Server-side upload.
   * @param {{file: Buffer|string, fileName: string, folder?: string}} p
   */
  async upload({ file, fileName, folder = 'misc' }) {
    const res = await getClient().upload({
      file,
      fileName,
      folder: `${env.IMAGEKIT_FOLDER}/${folder}`,
      useUniqueFileName: true,
    });
    return toStoredImage(res);
  },

  /** @param {string} fileId */
  async remove(fileId) {
    await getClient().deleteFile(fileId);
  },

  /** True when the url belongs to our ImageKit endpoint (blocks arbitrary external urls). */
  isOwnUrl(url) {
    return Boolean(env.IMAGEKIT_URL_ENDPOINT) && url.startsWith(`${env.IMAGEKIT_URL_ENDPOINT}/`);
  },
};
