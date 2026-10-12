/** Date helpers for the booking UI. Business dates are India time (IST). */
const IST_MS = 5.5 * 3600 * 1000;

/** "YYYY-MM-DD" of the IST day containing `d`. */
export const istDate = (d = new Date()) =>
  new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The next `count` bookable dates starting today. */
export const nextDates = (count = 14, from = istDate()) =>
  Array.from({ length: count }, (_, i) => addDays(from, i));

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** { top: "Today" | "Wed", day: 14, month: "Oct" } for a date chip. */
export function chipLabel(dateStr, today = istDate()) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const top =
    dateStr === today
      ? 'Today'
      : dateStr === addDays(today, 1)
        ? 'Tomorrow'
        : WEEKDAYS[d.getUTCDay()];
  return { top, day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

export const longDate = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "19:30" -> "7:30 PM" */
export function time12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Minimal .ics (calendar) file content for a booking. */
export function icsFor({ bookingNumber, date, slot, guests }) {
  const stamp = (t) => `${date.replaceAll('-', '')}T${t.replace(':', '')}00`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jail Ki Chai//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${bookingNumber}@jailkichai`,
    `DTSTAMP:${stamp('00:00')}`,
    `DTSTART;TZID=Asia/Kolkata:${stamp(slot.startTime)}`,
    `DTEND;TZID=Asia/Kolkata:${stamp(slot.endTime)}`,
    `SUMMARY:Table for ${guests} at Jail Ki Chai`,
    `DESCRIPTION:Booking ${bookingNumber}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
