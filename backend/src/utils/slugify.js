import { randomBytes } from 'node:crypto';

/** @param {string} text */
export const slugify = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';

/**
 * Create a doc whose `slug` is derived from `name`; on a duplicate slug retry with a random suffix.
 * @template T
 * @param {(slug: string) => Promise<T>} create
 * @param {string} name
 * @returns {Promise<T>}
 */
export async function createWithSlug(create, name) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
    try {
      return await create(slug);
    } catch (err) {
      if (err.code !== 11000 || !('slug' in (err.keyPattern ?? {}))) throw err;
    }
  }
  throw new Error('Could not generate a unique slug');
}
