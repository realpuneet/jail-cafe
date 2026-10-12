import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { labelFor, stepIndex, timelineFor } from '../status.js';

/**
 * Vertical progress timeline. The fill bar animates with scaleY (transform only) whenever
 * the status advances; the current step pulses.
 */
export default function OrderTimeline({ status, type, history = [] }) {
  const steps = timelineFor(type);
  const current = Math.max(stepIndex(status, type), 0);
  const fill = useRef(null);
  const root = useRef(null);
  const progress = steps.length > 1 ? current / (steps.length - 1) : 0;

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set(fill.current, { scaleY: progress });
      } else {
        gsap.to(fill.current, { scaleY: progress, duration: 0.9, ease: 'power3.inOut' });
        gsap.fromTo(
          '[data-current]',
          { scale: 0.8 },
          { scale: 1, duration: 0.6, ease: 'elastic.out(1,0.5)' },
        );
      }
    },
    { scope: root, dependencies: [progress, current] },
  );

  const at = (s) => history.find((h) => h.status === s)?.at;

  return (
    <ol ref={root} className="relative space-y-6 pl-10" aria-label="Order progress">
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-[15px] top-3 w-1 rounded bg-line"
      />
      <span
        ref={fill}
        aria-hidden="true"
        className="absolute bottom-3 left-[15px] top-3 w-1 origin-top rounded bg-kulhad dark:bg-saffron"
        style={{ transform: 'scaleY(0)' }}
      />
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const time = at(s);
        return (
          <li key={s} aria-current={active ? 'step' : undefined} className="relative">
            <span
              {...(active ? { 'data-current': true } : {})}
              className={`absolute -left-10 grid h-8 w-8 place-items-center rounded-full border-4 border-bg text-sm font-bold ${done || active ? 'bg-kulhad text-white dark:bg-saffron dark:text-iron' : 'bg-line text-muted'}`}
            >
              {done ? '✓' : i + 1}
            </span>
            <p className={`font-bold ${active ? 'text-lg' : done ? '' : 'text-muted'}`}>
              {labelFor(s, type)}
            </p>
            {time && (
              <p className="text-sm text-muted">
                {new Date(time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
