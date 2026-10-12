/** − 2 + control with accessible labels. */
export default function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  label = 'item',
  size = 'md',
  disabled = false,
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-lg' : 'h-10 w-10 text-xl';
  return (
    <div
      role="group"
      aria-label={`Quantity of ${label}`}
      className="inline-flex items-center rounded-full border-2 border-brand bg-surface text-brand"
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`Decrease ${label}`}
        className={`${dim} rounded-full font-bold hover:bg-surface-2 disabled:opacity-40`}
      >
        −
      </button>
      <span aria-live="polite" className="min-w-8 text-center text-base font-bold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${label}`}
        className={`${dim} rounded-full font-bold hover:bg-surface-2 disabled:opacity-40`}
      >
        +
      </button>
    </div>
  );
}
