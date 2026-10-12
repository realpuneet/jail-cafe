const UNITS = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Convert "15m" / "30d" / "3600" to seconds.
 * @param {string} value
 * @returns {number}
 */
export function toSeconds(value) {
  const m = /^(\d+)\s*([smhd])?$/.exec(String(value).trim());
  if (!m) throw new Error(`Invalid duration: ${value}`);
  return Number(m[1]) * UNITS[m[2] ?? 's'];
}
