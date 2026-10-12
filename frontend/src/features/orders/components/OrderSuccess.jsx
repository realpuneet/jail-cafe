import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';

/** Celebration after placing an order: ring + check pop, then chai-leaf confetti. */
export default function OrderSuccess({ orderNumber, onDone, title = 'Order placed!', message }) {
  const root = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.from('[data-ring]', { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(2)' })
        .from(
          '[data-check]',
          { scale: 0, rotate: -40, opacity: 0, duration: 0.45, ease: 'back.out(2.5)' },
          '-=0.15',
        )
        .from('[data-text]', { y: 14, opacity: 0, stagger: 0.1, duration: 0.4 }, '-=0.2');
      gsap.fromTo(
        '[data-bit]',
        { x: 0, y: 0, scale: 0.4, opacity: 1 },
        {
          x: () => gsap.utils.random(-140, 140),
          y: () => gsap.utils.random(-150, -40),
          rotate: () => gsap.utils.random(-200, 200),
          scale: () => gsap.utils.random(0.7, 1.2),
          opacity: 0,
          duration: 1.4,
          ease: 'power2.out',
          stagger: 0.02,
          delay: 0.35,
        },
      );
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      role="status"
      className="relative mx-auto max-w-md overflow-hidden rounded-3xl bg-surface-2 p-8 text-center"
    >
      <div className="relative mx-auto grid h-28 w-28 place-items-center">
        <span data-ring className="absolute inset-0 rounded-full bg-veg/15 ring-4 ring-veg/40" />
        <svg
          data-check
          viewBox="0 0 24 24"
          className="relative h-14 w-14 text-veg"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            data-bit
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-sm"
            style={{ background: ['#f4a300', '#b9471f', '#15803d', '#a9672a'][i % 4], opacity: 0 }}
          />
        ))}
      </div>
      <h2 data-text className="mt-4 text-3xl">
        {title}
      </h2>
      <p data-text className="mt-1 text-muted">
        {message ?? (
          <>
            Your order <strong>{orderNumber}</strong> is in. Out on good behaviour soon.
          </>
        )}
      </p>
      {onDone && (
        <button data-text onClick={onDone} className="mt-4 text-sm font-bold text-brand underline">
          Dismiss
        </button>
      )}
    </div>
  );
}
