/** Logo mark: a kulhad behind prison bars. */
export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#33201a" />
      <path d="M18 24h28l-3 24a6 6 0 0 1-6 5H27a6 6 0 0 1-6-5z" fill="#f4a300" />
      <path
        d="M46 28h3a5 5 0 0 1 0 10h-4"
        fill="none"
        stroke="#f4a300"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g stroke="#fbf6ef" strokeWidth="3" strokeLinecap="round">
        <path d="M16 10v44M26 10v44M36 10v44M46 10v44M56 10v44" opacity="0.9" />
      </g>
    </svg>
  );
}

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="whitespace-nowrap font-display text-lg leading-none tracking-wide sm:text-xl">
        Jail Ki <span className="text-kulhad dark:text-saffron">Chai</span>
      </span>
    </span>
  );
}

/** Decorative row of bars; use as a section edge. */
export function BarsDivider({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`bars h-3 w-full text-chai-300/50 dark:text-chai-700/60 ${className}`}
    />
  );
}
