import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { ImageKitProvider } from '@imagekit/react';
import ErrorBoundary from '../components/common/ErrorBoundary.jsx';
import { applyTheme, useUiStore } from '../features/ui/uiStore.js';
import { useBootstrapSession, useRealtimeSession } from '../features/auth/hooks.js';
import { env } from '../lib/env.js';
import { createLenis, destroyLenis } from '../lib/lenis.js';
import { ScrollTrigger } from '../lib/gsap.js';
import { queryClient } from '../lib/queryClient.js';

/**
 * Starts the single Lenis instance (driven by the GSAP ticker) and tears it down on unmount.
 * Honors prefers-reduced-motion live: turning the OS setting on disables smoothing.
 */
function LenisProvider({ children }) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (mq.matches) destroyLenis();
      else createLenis();
      ScrollTrigger.refresh();
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      destroyLenis();
    };
  }, []);
  return children;
}

function ThemeSync({ children }) {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(null);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return children;
}

function SessionSync({ children }) {
  useBootstrapSession();
  useRealtimeSession();
  return children;
}

export default function Providers({ children }) {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ImageKitProvider urlEndpoint={env.imagekitEndpoint || 'https://ik.imagekit.io/demo'}>
            <ThemeSync>
              <LenisProvider>
                <SessionSync>{children}</SessionSync>
              </LenisProvider>
            </ThemeSync>
          </ImageKitProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
