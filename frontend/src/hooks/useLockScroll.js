import { useEffect } from 'react';
import { startScroll, stopScroll } from '../lib/lenis.js';

let locks = 0;

/**
 * While `locked` is true, stop Lenis smooth scrolling (and block body scroll when Lenis is off).
 * Reference-counted so stacked modals/drawers don't re-enable scrolling too early.
 */
export function useLockScroll(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    locks += 1;
    stopScroll();
    document.body.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks === 0) {
        startScroll();
        document.body.style.overflow = '';
      }
    };
  }, [locked]);
}
