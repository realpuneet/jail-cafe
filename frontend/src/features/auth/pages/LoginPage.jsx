import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Seo from '../../../components/common/Seo.jsx';
import { BarsDivider, LogoMark } from '../../../components/common/Brand.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { toast } from '../../ui/uiStore.js';
import { requestOtp, verifyOtp } from '../api.js';
import { useAuthStore } from '../authStore.js';
import { startSession } from '../hooks.js';

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^(\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});
const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
  name: z.string().trim().max(80).optional(),
});

/** Passwordless login: phone -> OTP. New numbers are registered automatically. */
export default function LoginPage() {
  const [phone, setPhone] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const card = useRef(null);
  const target = location.state?.from?.pathname ?? '/';

  useGSAP(
    () => {
      if (!prefersReducedMotion()) gsap.from('[data-step]', { opacity: 0, y: 18, duration: 0.45 });
    },
    { scope: card, dependencies: [phone === null], revertOnUpdate: true },
  );

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneForm = useForm({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '' } });
  const otpForm = useForm({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '', name: '' },
  });

  if (status === 'authenticated') return <Navigate to={target} replace />;

  const send = async ({ phone: raw }) => {
    try {
      const res = await requestOtp(raw);
      setPhone(raw);
      setResendIn(res.resendIn ?? 30);
      toast.success('OTP sent');
    } catch (err) {
      phoneForm.setError('phone', { message: toApiError(err).message });
    }
  };

  const verify = async ({ otp, name }) => {
    try {
      const session = await verifyOtp({ phone, otp, name: name || undefined });
      await startSession(session, qc);
      navigate(target, { replace: true });
    } catch (err) {
      otpForm.setError('otp', { message: toApiError(err).message });
    }
  };

  const resend = async () => {
    try {
      const res = await requestOtp(phone);
      setResendIn(res.resendIn ?? 30);
      toast.success('New OTP sent');
    } catch (err) {
      toast.error(toApiError(err).message);
    }
  };

  return (
    <div className="container-page grid min-h-[70dvh] place-items-center py-10">
      <Seo title="Login" noindex />
      <div ref={card} className="card w-full max-w-md overflow-hidden">
        <BarsDivider />
        <div className="p-6 sm:p-8">
          <LogoMark className="mb-4 h-12 w-12" />
          {phone === null ? (
            <form
              key="phone"
              data-step
              onSubmit={phoneForm.handleSubmit(send)}
              noValidate
              className="space-y-5"
            >
              <div>
                <h1 className="text-3xl">Break out. Log in.</h1>
                <p className="mt-2 text-muted">
                  We&apos;ll text you a one-time password. No passwords to remember.
                </p>
              </div>
              <Input
                label="Mobile number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                autoFocus
                error={phoneForm.formState.errors.phone?.message}
                {...phoneForm.register('phone')}
              />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={phoneForm.formState.isSubmitting}
              >
                Send OTP
              </Button>
            </form>
          ) : (
            <form
              key="otp"
              data-step
              onSubmit={otpForm.handleSubmit(verify)}
              noValidate
              className="space-y-5"
            >
              <div>
                <h1 className="text-3xl">Enter the OTP</h1>
                <p className="mt-2 text-muted">
                  Sent to <strong>{phone}</strong>.{' '}
                  <button
                    type="button"
                    className="font-bold text-brand underline"
                    onClick={() => setPhone(null)}
                  >
                    Change
                  </button>
                </p>
              </div>
              <Input
                label="6-digit OTP"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                autoFocus
                className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
                error={otpForm.formState.errors.otp?.message}
                {...otpForm.register('otp')}
              />
              <Input
                label="Your name (optional)"
                autoComplete="name"
                hint="Only needed the first time."
                {...otpForm.register('name')}
              />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={otpForm.formState.isSubmitting}
              >
                Verify &amp; continue
              </Button>
              <p className="text-center text-sm text-muted">
                {resendIn > 0 ? (
                  <>Resend OTP in {resendIn}s</>
                ) : (
                  <button type="button" onClick={resend} className="font-bold text-brand underline">
                    Resend OTP
                  </button>
                )}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
