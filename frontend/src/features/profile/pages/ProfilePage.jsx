import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import { ErrorState } from '../../../components/ui/States.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatPhone } from '../../../lib/format.js';
import { updateMe } from '../../auth/api.js';
import { useAuthStore } from '../../auth/authStore.js';
import { endSession } from '../../auth/hooks.js';
import { toast, useUiStore } from '../../ui/uiStore.js';
import AddressList from '../components/AddressList.jsx';
import { useAddresses } from '../hooks.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]),
});

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: addresses, isLoading, isError, refetch } = useAddresses();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });
  const save = useMutation({
    mutationFn: (v) => updateMe({ name: v.name, ...(v.email ? { email: v.email } : {}) }),
    onSuccess: (u) => {
      setUser(u);
      toast.success('Profile updated');
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const logout = async () => {
    await endSession(qc);
    navigate('/', { replace: true });
  };

  return (
    <div className="container-page max-w-2xl space-y-8 py-8">
      <Seo title="Profile" noindex />
      <h1 className="text-4xl">Your profile</h1>

      <section className="card space-y-4 p-5" aria-labelledby="acct">
        <h2 id="acct" className="text-2xl">
          Account
        </h2>
        <p className="text-muted">
          Mobile: <strong className="text-fg">{formatPhone(user?.phone)}</strong>
        </p>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
          <Input
            label="Name"
            autoComplete="name"
            error={formState.errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Email (optional)"
            type="email"
            autoComplete="email"
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </section>

      <section aria-labelledby="addr">
        <h2 id="addr" className="mb-3 text-2xl">
          Saved addresses
        </h2>
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <AddressList addresses={addresses} userName={user?.name} />
        )}
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-2xl">Appearance</h2>
          <p className="text-muted">Current: {theme ?? 'follows your device'}</p>
        </div>
        <Button variant="outline" onClick={toggleTheme}>
          Switch light / dark
        </Button>
      </section>

      <Button variant="danger" onClick={logout} className="w-full sm:w-auto">
        Log out
      </Button>
    </div>
  );
}
