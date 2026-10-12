import { useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '../../lib/gsap.js';

/**
 * Scroll-triggered fade/slide-in for a single block.
 * @param {{as?: string, y?: number, x?: number, delay?: number, className?: string, children: import('react').ReactNode}} props
 */
export default function Reveal({
  as: Tag = 'div',
  y = 28,
  x = 0,
  delay = 0,
  className,
  children,
  ...rest
}) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0, y, x },
        {
          opacity: 1,
          y: 0,
          x: 0,
          delay,
          clearProps: 'transform',
          scrollTrigger: { trigger: ref.current, start: 'top 88%', once: true },
        },
      );
      return () => ScrollTrigger.getAll().forEach((t) => t.trigger === ref.current && t.kill());
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
