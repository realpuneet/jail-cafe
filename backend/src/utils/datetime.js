/** All business dates are India Standard Time (UTC+05:30, no DST). */
const IST_MS = 5.5 * 3600 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Real calendar date check: V8 rolls "2026-02-30" over to March, so compare the round trip. */
export const isDateString = (s) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};
export const isTimeString = (s) => TIME_RE.test(s);

/** "YYYY-MM-DD" of the IST calendar day containing `d`. */
export const istDate = (d = new Date()) =>
  new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

/** Shift a "YYYY-MM-DD" string by whole days. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 (Sunday) - 6 (Saturday) for an IST calendar date. */
export const weekday = (dateStr) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

/** The instant a slot starts: IST date + "HH:mm". */
export const slotStartsAt = (dateStr, hhmm) => new Date(`${dateStr}T${hhmm}:00+05:30`);

/** "19:30" -> "7:30 PM" for messages. */
export function formatTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
