/** ₹ <-> paise helpers for admin forms (the API works in integer paise). */
export const rupeesToPaise = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};
export const paiseToRupees = (p) => (p === undefined || p === null ? '' : String(p / 100));

/** datetime-local value <-> ISO string. */
export const toLocalInput = (iso) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : undefined);
