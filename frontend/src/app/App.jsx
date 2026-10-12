import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';
import MainLayout from './layouts/MainLayout.jsx';

// Route-level code splitting: each page is its own chunk, behind <Suspense> in MainLayout.
const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage.jsx'));
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
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage.jsx'));

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/:slug" element={<ItemDetailPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="book-table" element={<BookTablePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<MyOrdersPage />} />
          <Route path="orders/:id" element={<OrderTrackingPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
