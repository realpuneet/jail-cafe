import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLockScroll } from '../../hooks/useLockScroll.js';
import { gsap, prefersReducedMotion } from '../../lib/gsap.js';

const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus trap, Esc to close, restores focus, locks (Lenis) scrolling.
 * @param {{open: boolean, onClose: () => void, title: string, children: import('react').ReactNode, size?: 'sm'|'md'|'lg'}} props
 */
export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const panel = useRef(null);
  const titleId = useId();
  useLockScroll(open);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const el = panel.current;
    if (el && !prefersReducedMotion()) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 24, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3 },
      );
    }
    // Focus after the tween starts so the animation setup can never steal focus.
    el?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      data-lenis-prevent
    >
      <div
        className="absolute inset-0 bg-iron/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`card relative max-h-[90dvh] w-full ${width} overflow-y-auto rounded-b-none p-5 sm:rounded-b-[1.25rem] sm:p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
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
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
