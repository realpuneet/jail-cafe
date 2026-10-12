import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { BarsDivider, LogoMark } from '../../../components/common/Brand.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { passwordLogin } from '../api.js';
import { useAuthStore } from '../authStore.js';
import { startSession } from '../hooks.js';

const schema = z.object({
  email: z.string().trim().email('Enter your work email'),
  password: z.string().min(1, 'Enter your password'),
});

/** Email + password sign-in for admin, staff and riders. Customers use the OTP login. */
export default function StaffLoginPage() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { register, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'authenticated')
    return <Navigate to={role === 'customer' ? '/' : '/admin'} replace />;

  const submit = async (values) => {
    try {
      const session = await passwordLogin(values);
      await startSession(session, qc);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError('root', { message: toApiError(err).message });
    }
  };

  return (
    <div className="container-page grid min-h-[70dvh] place-items-center py-10">
      <Seo title="Staff login" noindex />
      <div className="card w-full max-w-md overflow-hidden">
        <BarsDivider />
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5 p-6 sm:p-8">
          <LogoMark className="h-12 w-12" />
          <div>
            <h1 className="text-3xl">Staff login</h1>
            <p className="mt-2 text-muted">
              For the Jail Ki Chai team. Customers sign in with a mobile OTP.
            </p>
          </div>
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={formState.errors.password?.message}
            {...register('password')}
          />
          {formState.errors.root && (
            <p role="alert" className="font-medium text-nonveg">
              {formState.errors.root.message}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
