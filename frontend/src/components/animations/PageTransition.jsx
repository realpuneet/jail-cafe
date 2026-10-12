import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '../../lib/gsap.js';
import { getLenis } from '../../lib/lenis.js';

/**
 * Wrap the routed outlet: on every navigation, scroll to top, fade/slide the new page in and
 * refresh ScrollTrigger once layout settles. Old triggers are reverted by useGSAP/each page's context.
 */
export default function PageTransition({ children }) {
  const ref = useRef(null);
  const { pathname } = useLocation();

  useGSAP(
    () => {
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(0, { immediate: true });
      else window.scrollTo(0, 0);

      if (!prefersReducedMotion()) {
        gsap.fromTo(
          ref.current,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.45, clearProps: 'transform,opacity' },
        );
      }
      const t = setTimeout(() => ScrollTrigger.refresh(), 150);
      return () => clearTimeout(t);
    },
    { scope: ref, dependencies: [pathname], revertOnUpdate: true },
  );

  return (
    <div ref={ref} key={pathname}>
      {children}
    </div>
  );
}
