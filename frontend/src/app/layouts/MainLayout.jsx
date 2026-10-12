import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import PageTransition from '../../components/animations/PageTransition.jsx';
import { BarsDivider, Logo } from '../../components/common/Brand.jsx';
import Toaster from '../../components/ui/Toaster.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuthStore } from '../../features/auth/authStore.js';
import CartDrawer from '../../features/cart/components/CartDrawer.jsx';
import { useCart, useCartDrawer } from '../../features/cart/useCart.js';
import { useUnreadCount } from '../../features/notifications/hooks.js';
import { useUiStore } from '../../features/ui/uiStore.js';

const navCls = ({ isActive }) =>
  `rounded-full px-4 py-2 font-bold transition-colors ${isActive ? 'bg-surface-2 text-brand' : 'hover:bg-surface-2'}`;

function Icon({ name }) {
  const paths = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01',
    orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 0 0 4 0',
    moon: 'M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z',
    table: 'M4 8h16M6 8v11M18 8v11M9 8V5h6v3',
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function CartButton({ className = '' }) {
  const { itemCount } = useCart();
  const { openCart } = useCartDrawer();
  return (
    <button
      onClick={openCart}
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      className={`relative grid h-11 w-11 place-items-center rounded-full hover:bg-surface-2 ${className}`}
    >
      <Icon name="cart" />
      {itemCount > 0 && (
        <span
          key={itemCount}
          className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-[pop_0.3s_ease] place-items-center rounded-full bg-kulhad px-1 text-xs font-bold text-white"
        >
          {itemCount}
        </span>
      )}
    </button>
  );
}

function Header() {
  const status = useAuthStore((s) => s.status);
  const authed = status === 'authenticated';
  const user = useAuthStore((s) => s.user);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const { data: unread = 0 } = useUnreadCount(authed);
  const ref = useRef(null);

  useEffect(() => {
    const set = () =>
      document.documentElement.style.setProperty(
        '--header-h',
        `${ref.current?.offsetHeight ?? 64}px`,
      );
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="Jail Ki Chai, home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavLink to="/menu" className={navCls}>
            Menu
          </NavLink>
          <NavLink to="/book-table" className={navCls}>
            Book a table
          </NavLink>
          <NavLink to="/party" className={navCls}>
            Parties
          </NavLink>
          {authed && (
            <NavLink to="/orders" className={navCls}>
              My orders
            </NavLink>
          )}
          {authed && (
            <NavLink to="/bookings" className={navCls}>
              Bookings
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="hidden h-11 w-11 place-items-center rounded-full hover:bg-surface-2 sm:grid"
          >
            <Icon name="moon" />
          </button>
          {authed && (
            <Link
              to="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              className="relative hidden h-11 w-11 place-items-center rounded-full hover:bg-surface-2 sm:grid"
            >
              <Icon name="bell" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-kulhad" />
              )}
            </Link>
          )}
          <CartButton />
          {authed ? (
            <Link
              to="/profile"
              className="hidden h-11 items-center rounded-full bg-surface-2 px-4 font-bold md:inline-flex"
            >
              {user?.name?.split(' ')[0] || 'Profile'}
            </Link>
          ) : (
            status !== 'idle' && (
              <Link
                to="/login"
                className="inline-flex h-11 items-center rounded-full bg-chai-700 px-5 font-bold text-white hover:bg-chai-800 dark:bg-saffron dark:text-iron"
              >
                Login
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const { itemCount } = useCart();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const items = [
    ['/', 'Home', 'home', true],
    ['/menu', 'Menu', 'menu'],
    ['/book-table', 'Book', 'table'],
    ['/cart', 'Cart', 'cart'],
    [authed ? '/profile' : '/login', authed ? 'Me' : 'Login', 'user'],
  ];
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(([to, label, icon, end], i) => (
          <li key={`${to}-${i}`}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${isActive ? 'text-kulhad dark:text-saffron' : 'text-muted'}`
              }
            >
              <Icon name={icon} />
              {label}
              {icon === 'cart' && itemCount > 0 && (
                <span className="absolute right-[28%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-kulhad px-1 text-[10px] text-white">
                  {itemCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 bg-chai-900 pb-24 text-chai-100 md:pb-8">
      <BarsDivider className="text-chai-100/10" />
      <div className="container-page grid gap-8 py-10 sm:grid-cols-3">
        <div>
          <Logo className="[&_span]:text-chai-50" />
          <p className="mt-3 max-w-xs text-sm text-chai-200">
            Serving chai and fast food on good behaviour since day one.
          </p>
        </div>
        <nav aria-label="Footer" className="text-sm">
          <p className="mb-2 font-bold text-chai-50">Explore</p>
          <ul className="space-y-1.5">
            <li>
              <Link className="hover:underline" to="/menu">
                Menu
              </Link>
            </li>
            <li>
              <Link className="hover:underline" to="/book-table">
                Book a table
              </Link>
            </li>
            <li>
              <Link className="hover:underline" to="/party">
                Party booking
              </Link>
            </li>
            <li>
              <Link className="hover:underline" to="/orders">
                My orders
              </Link>
            </li>
            <li>
              <Link className="hover:underline" to="/profile">
                Profile
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-sm text-chai-300 sm:text-right">
          © {new Date().getFullYear()} Jail Ki Chai. Please drink responsibly, one more cup never
          hurt.
        </p>
      </div>
    </footer>
  );
}

export default function MainLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-full bg-saffron px-4 py-2 font-bold text-iron"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageTransition>
          <Suspense key={pathname} fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </PageTransition>
      </main>
      <Footer />
      <MobileNav />
      <CartDrawer />
      <Toaster />
    </div>
  );
}
