import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap.js';

/**
 * Scroll-linked vertical parallax on `target` (transform only).
 * @param {import('react').RefObject<HTMLElement>} target element that moves
 * @param {{speed?: number, trigger?: import('react').RefObject<HTMLElement>}} [opts] speed in % of its height
 */
export function useParallax(target, { speed = 12, trigger } = {}) {
  useGSAP(
    () => {
      if (!target.current || prefersReducedMotion()) return;
      gsap.fromTo(
        target.current,
        { yPercent: -speed },
        {
          yPercent: speed,
          ease: 'none',
          scrollTrigger: {
            trigger: trigger?.current ?? target.current,
            scrub: true,
            start: 'top bottom',
            end: 'bottom top',
          },
        },
      );
    },
    { scope: target },
  );
}
