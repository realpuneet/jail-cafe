import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../api.js', () => ({ requestOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('../../cart/guestCart.js', () => ({
  mergeGuestCart: vi.fn().mockResolvedValue(undefined),
}));

import { requestOtp, verifyOtp } from '../api.js';
import { useAuthStore } from '../authStore.js';
import LoginPage from '../pages/LoginPage.jsx';

function renderLogin() {
  const qc = new QueryClient();
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[{ pathname: '/login', state: { from: { pathname: '/checkout' } } }]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/checkout" element={<p>checkout page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: 'guest', accessToken: null, user: null });
});

describe('LoginPage', () => {
  it('validates the phone number before calling the API', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid 10-digit/i);
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('runs phone -> OTP -> session, then returns to the page the user came from', async () => {
    requestOtp.mockResolvedValue({ expiresIn: 300, resendIn: 30 });
    verifyOtp.mockResolvedValue({ accessToken: 'tok', user: { _id: 'u1', name: 'Asha' } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    expect(requestOtp).toHaveBeenCalledWith('9876543210');

    await user.type(await screen.findByLabelText('6-digit OTP'), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(screen.getByText('checkout page')).toBeInTheDocument());
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '9876543210', otp: '123456', name: undefined });
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', accessToken: 'tok' });
  });

  it('shows the API error for a wrong OTP and stays on the form', async () => {
    requestOtp.mockResolvedValue({ resendIn: 30 });
    verifyOtp.mockRejectedValue({
      response: { status: 401, data: { message: 'Invalid OTP. 4 attempt(s) left' } },
    });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    await user.type(await screen.findByLabelText('6-digit OTP'), '000000');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText(/4 attempt\(s\) left/)).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('guest');
  });
});

describe('startSession ordering', () => {
  it('merges the guest cart before the store becomes authenticated', async () => {
    const { mergeGuestCart } = await import('../../cart/guestCart.js');
    const { startSession } = await import('../hooks.js');
    const order = [];
    mergeGuestCart.mockImplementation(async () => {
      order.push(
        `merge(status=${useAuthStore.getState().status}, token=${useAuthStore.getState().accessToken})`,
      );
    });
    await startSession({ accessToken: 'tok2', user: { _id: 'u' } }, new QueryClient());
    order.push(`after(status=${useAuthStore.getState().status})`);
    expect(order).toEqual(['merge(status=guest, token=tok2)', 'after(status=authenticated)']);
  });
});
