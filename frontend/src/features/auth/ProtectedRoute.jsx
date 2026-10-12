import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuthStore } from './authStore.js';

/**
 * Gate for signed-in pages. While the session is being restored we show a skeleton (no flash
 * of the login page); guests are sent to /login and returned afterwards.
 * @param {{roles?: string[]}} props
 */
export default function ProtectedRoute({ roles }) {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);
  const location = useLocation();

  if (status === 'idle') return <PageSkeleton />;
  if (status !== 'authenticated')
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
