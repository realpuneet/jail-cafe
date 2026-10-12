import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap.js';

/**
 * Animate a number from its previous value to `value`; returns a ref for the element whose
 * textContent is updated imperatively (no re-render per frame).
 * @param {number} value
 * @param {(n: number) => string} [format]
 */
export function useCountUp(value, format = (n) => Math.round(n).toLocaleString('en-IN')) {
  const ref = useRef(null);
  const state = useRef({ n: 0 });
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        state.current.n = value;
        el.textContent = format(value);
        return;
      }
      gsap.to(state.current, {
        n: value,
        duration: 1.1,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = format(state.current.n);
        },
      });
    },
    { dependencies: [value] },
  );
  return ref;
}
