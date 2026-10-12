/** Veg / non-veg indicator in the Indian FSSAI style (square with dot). */
export function VegMark({ isVeg, className = '' }) {
  const color = isVeg ? 'var(--color-veg)' : 'var(--color-nonveg)';
  return (
    <span
      role="img"
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`inline-grid h-4 w-4 place-items-center rounded-[3px] border-2 ${className}`}
      style={{ borderColor: color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg',
    success: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200',
    warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    danger: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
