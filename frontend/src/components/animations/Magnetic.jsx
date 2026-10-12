import { cloneElement, useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap.js';

/**
 * Makes its single child drift toward the pointer. Disabled on touch and for reduced motion.
 * @param {{strength?: number, children: import('react').ReactElement}} props
 */
export default function Magnetic({ strength = 0.3, children }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion() || window.matchMedia('(hover: none)').matches)
        return undefined;
      const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
      const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
      const move = (e) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - (r.left + r.width / 2)) * strength);
        y((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const leave = () => {
        x(0);
        y(0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      return () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
      };
    },
    { scope: ref },
  );
  return cloneElement(children, { ref });
}
