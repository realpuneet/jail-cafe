import { Suspense } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Logo } from '../../components/common/Brand.jsx';
import Seo from '../../components/common/Seo.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import Toaster from '../../components/ui/Toaster.jsx';
import { useAuthStore } from '../auth/authStore.js';
import { useUiStore } from '../ui/uiStore.js';
import { useStaffRealtime } from './hooks.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', roles: ['admin'], end: true },
  { to: '/admin/orders', label: 'Orders', icon: '🧾', roles: ['admin', 'staff'] },
  { to: '/admin/menu', label: 'Menu', icon: '🍽️', roles: ['admin', 'staff'] },
  { to: '/admin/bookings', label: 'Bookings', icon: '🪑', roles: ['admin', 'staff'] },
  { to: '/admin/party', label: 'Parties', icon: '🎉', roles: ['admin', 'staff'] },
  { to: '/admin/coupons', label: 'Coupons', icon: '🏷️', roles: ['admin'] },
  { to: '/admin/banners', label: 'Banners', icon: '🖼️', roles: ['admin'] },
  { to: '/admin/reviews', label: 'Reviews', icon: '⭐', roles: ['admin'] },
  { to: '/admin/users', label: 'Users', icon: '👥', roles: ['admin'] },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️', roles: ['admin', 'staff'] },
];

/** Staff console shell: sidebar on desktop, scrollable tab bar on mobile. Keeps the realtime feed alive. */
export default function AdminLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  useStaffRealtime();
  const items = NAV.filter((n) => n.roles.includes(role));
  const link = ({ isActive }) =>
    `flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 font-bold ${isActive ? 'bg-surface-2 text-brand' : 'hover:bg-surface-2'}`;

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[15rem_1fr]">
      <Seo title="Admin" noindex />
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <Link to="/admin" aria-label="Admin home">
            <Logo />
          </Link>
          <div className="flex gap-2 md:mt-3">
            <Link to="/" className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold">
              View site
            </Link>
            <button
              onClick={toggleTheme}
              className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold"
              aria-label="Toggle dark mode"
            >
              🌓
            </button>
          </div>
        </div>
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:overflow-visible md:pb-0 [scrollbar-width:none]"
        >
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={link}>
              <span aria-hidden="true">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 p-4 outline-none sm:p-6">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}
