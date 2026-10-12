const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Format integer paise as rupees: 15050 -> "₹150.50", 15000 -> "₹150". */
export function formatPrice(paise) {
  const value = (paise ?? 0) / 100;
  return Number.isInteger(value) ? inrWhole.format(value) : inr.format(value);
}

export const formatDateTime = (iso) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

export const formatDate = (iso) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso));

/** "+919876543210" -> "+91 98765 43210" */
export function formatPhone(e164) {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164 ?? '');
  return m ? `+91 ${m[1]} ${m[2]}` : (e164 ?? '');
}

/** Minutes remaining until `iso`, floored at 0. */
export const minutesUntil = (iso) =>
  Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
