import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../features/auth/authStore.js';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';
import MainLayout from './layouts/MainLayout.jsx';

// Route-level code splitting: each page is its own chunk, behind <Suspense> in MainLayout.
const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage.jsx'));
const StaffLoginPage = lazy(() => import('../features/auth/pages/StaffLoginPage.jsx'));
const MenuPage = lazy(() => import('../features/menu/pages/MenuPage.jsx'));
const ItemDetailPage = lazy(() => import('../features/menu/pages/ItemDetailPage.jsx'));
const CartPage = lazy(() => import('../features/cart/pages/CartPage.jsx'));
const CheckoutPage = lazy(() => import('../features/orders/pages/CheckoutPage.jsx'));
const MyOrdersPage = lazy(() => import('../features/orders/pages/MyOrdersPage.jsx'));
const OrderTrackingPage = lazy(() => import('../features/orders/pages/OrderTrackingPage.jsx'));
const ProfilePage = lazy(() => import('../features/profile/pages/ProfilePage.jsx'));
const BookTablePage = lazy(() => import('../features/booking/pages/BookTablePage.jsx'));
const BookingDetailPage = lazy(() => import('../features/booking/pages/BookingDetailPage.jsx'));
const MyBookingsPage = lazy(() => import('../features/booking/pages/MyBookingsPage.jsx'));
const PartyPage = lazy(() => import('../features/party/pages/PartyPage.jsx'));
const MyPartyInquiriesPage = lazy(() => import('../features/party/pages/MyPartyInquiriesPage.jsx'));
const PartyInquiryDetailPage = lazy(
  () => import('../features/party/pages/PartyInquiryDetailPage.jsx'),
);
const AdminLayout = lazy(() => import('../features/admin/AdminLayout.jsx'));
const AdminDashboard = lazy(() => import('../features/admin/pages/DashboardPage.jsx'));
const AdminOrders = lazy(() => import('../features/admin/pages/OrdersBoardPage.jsx'));
const AdminMenu = lazy(() => import('../features/admin/pages/MenuManagerPage.jsx'));
const AdminBookings = lazy(() => import('../features/admin/pages/BookingsPage.jsx'));
const AdminParty = lazy(() => import('../features/admin/pages/PartyAdminPage.jsx'));
const AdminCoupons = lazy(() => import('../features/admin/pages/CouponsPage.jsx'));
const AdminBanners = lazy(() => import('../features/admin/pages/BannersPage.jsx'));
const AdminReviews = lazy(() => import('../features/admin/pages/ReviewsPage.jsx'));
const AdminUsers = lazy(() => import('../features/admin/pages/UsersPage.jsx'));
const AdminSettings = lazy(() => import('../features/admin/pages/SettingsPage.jsx'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage.jsx'));

/** /admin lands on the dashboard for admins and on the live board for staff. */
function AdminHome() {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'admin' ? <AdminDashboard /> : <Navigate to="/admin/orders" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Staff console: its own shell, role-gated (staff: orders/menu stock/bookings/parties; admin: everything) */}
      <Route element={<ProtectedRoute roles={['admin', 'staff']} />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="menu" element={<AdminMenu />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="party" element={<AdminParty />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="banners" element={<AdminBanners />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/:slug" element={<ItemDetailPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="book-table" element={<BookTablePage />} />
        <Route path="party" element={<PartyPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="staff-login" element={<StaffLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<MyOrdersPage />} />
          <Route path="orders/:id" element={<OrderTrackingPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="party/inquiries" element={<MyPartyInquiriesPage />} />
          <Route path="party/inquiries/:id" element={<PartyInquiryDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
