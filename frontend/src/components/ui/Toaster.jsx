import { useEffect } from 'react';
import { useUiStore } from '../../features/ui/uiStore.js';

const tone = {
  success: 'bg-veg text-white',
  error: 'bg-nonveg text-white',
  info: 'bg-chai-900 text-chai-50 dark:bg-chai-100 dark:text-chai-900',
};

function Toast({ toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.type === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast.id, toast.type, dismiss]);
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${tone[toast.type]}`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-full p-1 opacity-80 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

/** Stack of toasts above the mobile nav. aria-live so screen readers announce them. */
export default function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] mx-auto flex max-w-md flex-col gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}
