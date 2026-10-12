import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLockScroll } from '../../hooks/useLockScroll.js';
import { gsap, prefersReducedMotion } from '../../lib/gsap.js';

/** Right-hand slide-in panel (cart). GSAP slides it with transform only. */
export default function Drawer({ open, onClose, title, children, footer }) {
  const panel = useRef(null);
  const shade = useRef(null);
  const titleId = useId();
  useLockScroll(open);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panel.current?.querySelector('button, a, input')?.focus();
    if (!prefersReducedMotion()) {
      gsap.fromTo(
        panel.current,
        { xPercent: 100 },
        { xPercent: 0, duration: 0.4, ease: 'power3.out' },
      );
      gsap.fromTo(shade.current, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]" data-lenis-prevent>
      <div
        ref={shade}
        className="absolute inset-0 bg-iron/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-bg shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line bg-surface px-5 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
