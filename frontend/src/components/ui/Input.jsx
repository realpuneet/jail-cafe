import { forwardRef, useId } from 'react';

/**
 * Labelled text input with an accessible error message.
 * Works with react-hook-form via {...register('field')}.
 */
const Input = forwardRef(function Input({ label, error, hint, className = '', id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy =
    [error && `${inputId}-err`, hint && `${inputId}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-bold">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`h-12 w-full rounded-xl border-2 bg-surface px-4 text-base placeholder:text-muted/70 focus:border-kulhad focus:outline-none ${
          error ? 'border-nonveg' : 'border-line'
        }`}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-err`} role="alert" className="mt-1 text-sm font-medium text-nonveg">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
