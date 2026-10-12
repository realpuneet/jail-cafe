import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap.js';

/** Looping steam wisps above a kulhad. Transform + opacity only; static when motion is reduced. */
export default function ChaiSteam({ className }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray('[data-steam]').forEach((el, i) => {
        gsap
          .timeline({ repeat: -1, delay: i * 0.6 })
          .fromTo(
            el,
            { opacity: 0, y: 24, scaleX: 0.8 },
            { opacity: 0.85, y: 0, duration: 1.2, ease: 'sine.out' },
          )
          .to(el, { opacity: 0, y: -30, scaleX: 1.15, duration: 1.4, ease: 'sine.in' });
      });
    },
    { scope: ref },
  );
  return (
    <svg
      ref={ref}
      viewBox="0 0 120 220"
      className={className}
      role="img"
      aria-label="Steaming cup of chai"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5" opacity="0.8">
        <path data-steam d="M40 70c-12-14 12-22 0-38" />
        <path data-steam d="M62 74c-12-14 12-22 0-38" />
        <path data-steam d="M84 70c-12-14 12-22 0-38" />
      </g>
      <path
        d="M22 96h76l-8 76a18 18 0 0 1-18 16H48a18 18 0 0 1-18-16z"
        fill="var(--color-chai-500)"
      />
      <path d="M26 112h68l-1.5 14h-65z" fill="var(--color-chai-300)" opacity="0.7" />
      <path
        d="M98 112h8a12 12 0 0 1 0 24h-12"
        fill="none"
        stroke="var(--color-chai-500)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
