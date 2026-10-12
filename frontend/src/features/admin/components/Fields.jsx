import { forwardRef, useId } from 'react';

const base =
  'w-full rounded-xl border-2 border-line bg-surface px-3 focus:border-kulhad focus:outline-none';

export const SelectField = forwardRef(function SelectField(
  { label, children, className = '', error, ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <select ref={ref} id={id} className={`${base} h-12`} {...rest}>
        {children}
      </select>
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-nonveg">
          {error}
        </p>
      )}
    </div>
  );
});

export const TextAreaField = forwardRef(function TextAreaField(
  { label, className = '', error, ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <textarea ref={ref} id={id} rows={3} className={`${base} p-3`} {...rest} />
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-nonveg">
          {error}
        </p>
      )}
    </div>
  );
});

export const CheckField = forwardRef(function CheckField(
  { label, hint, className = '', ...rest },
  ref,
) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-1 h-5 w-5 accent-[var(--color-kulhad)]"
        {...rest}
      />
      <span>
        <span className="font-bold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
});

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-veg' : 'bg-line'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

export function Panel({ title, actions, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-2xl">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function LoadMore({ query }) {
  if (!query.hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={() => query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
        className="rounded-full border-2 border-line px-5 py-2 font-bold hover:bg-surface-2 disabled:opacity-50"
      >
        {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
