import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap.js';

/**
 * Word-by-word reveal. Text is split into spans (accessible: the full text is in aria-label).
 * @param {{text: string, as?: string, className?: string, delay?: number}} props
 */
export default function SplitText({ text, as: Tag = 'span', className, delay = 0 }) {
  const ref = useRef(null);
  const words = text.split(' ');
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-word]', {
        yPercent: 110,
        opacity: 0,
        stagger: 0.07,
        delay,
        duration: 0.8,
        ease: 'power4.out',
      });
    },
    { scope: ref, dependencies: [text] },
  );
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="inline-block overflow-hidden align-bottom"
          aria-hidden="true"
        >
          <span data-word className="inline-block will-change-transform">
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </Tag>
  );
}
