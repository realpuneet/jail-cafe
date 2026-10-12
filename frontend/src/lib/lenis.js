import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from './gsap.js';

/** The one and only Lenis instance. Created/destroyed by <LenisProvider/>. */
let lenis = null;
let tickerFn = null;

export const getLenis = () => lenis;

/**
 * Start smooth scrolling and drive it from the GSAP ticker so ScrollTrigger stays in sync.
 * Skipped entirely for reduced-motion users; touch devices keep native momentum scrolling.
 * @returns {Lenis|null}
 */
export function createLenis() {
  if (lenis || prefersReducedMotion()) return lenis;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false, // native touch scrolling feels better than emulated momentum
    autoRaf: false, // the GSAP ticker calls raf()
  });

  lenis.on('scroll', ScrollTrigger.update);
  tickerFn = (time) => lenis?.raf(time * 1000); // gsap time is seconds, Lenis wants ms
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function destroyLenis() {
  if (tickerFn) gsap.ticker.remove(tickerFn);
  tickerFn = null;
  lenis?.destroy();
  lenis = null;
  gsap.ticker.lagSmoothing(500, 33); // restore GSAP defaults
}

/** Pause / resume smooth scrolling (modals, drawers). Safe when Lenis is disabled. */
export const stopScroll = () => lenis?.stop();
export const startScroll = () => lenis?.start();
