import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Spinner from './Spinner.jsx';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-[background-color,box-shadow,opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-55 disabled:pointer-events-none select-none whitespace-nowrap';

const variants = {
  primary:
    'bg-chai-700 text-white hover:bg-chai-800 shadow-md dark:bg-saffron dark:text-iron dark:hover:bg-amber-400',
  accent: 'bg-saffron text-iron hover:bg-amber-400 shadow-md',
  outline: 'border-2 border-current text-brand hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-nonveg text-white hover:bg-red-800',
};
const sizes = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-base',
  lg: 'h-14 px-8 text-lg',
  icon: 'h-11 w-11',
};

/**
 * @param {{variant?: keyof typeof variants, size?: keyof typeof sizes, loading?: boolean, to?: string}} props
 * Renders a router <Link> when `to` is passed, otherwise a <button>.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    to,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export default Button;
