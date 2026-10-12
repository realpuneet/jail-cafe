import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '../lib/gsap.js';

/**
 * Fade/slide children matching `selector` into view when `scope` scrolls on screen.
 * Only transform + opacity are animated. Cleanup is automatic (useGSAP reverts the context).
 * @param {import('react').RefObject<HTMLElement>} scope
 * @param {{selector?: string, y?: number, stagger?: number, start?: string, deps?: any[]}} [opts]
 */
export function useGsapReveal(
  scope,
  { selector = '[data-reveal]', y = 24, stagger = 0.08, start = 'top 85%', deps = [] } = {},
) {
  useGSAP(
    () => {
      const targets = gsap.utils.toArray(selector, scope.current);
      if (!targets.length || prefersReducedMotion()) return;
      gsap.set(targets, { opacity: 0, y });
      ScrollTrigger.batch(targets, {
        start,
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, stagger, overwrite: true, clearProps: 'transform' }),
      });
    },
    { scope, dependencies: deps, revertOnUpdate: true },
  );
}
