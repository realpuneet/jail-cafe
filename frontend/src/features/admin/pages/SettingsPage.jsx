import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api, unwrap } from '../../../lib/axios.js';
import { useAuthStore } from '../../auth/authStore.js';
import { toast } from '../../ui/uiStore.js';
import { CheckField, Panel } from '../components/Fields.jsx';

/** Shared settings query + saver (used by this page and the dashboard quick toggle). */
export function useSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/admin/settings').then(unwrap),
  });
  const mutation = useMutation({
    mutationFn: (patch) => api.put('/admin/settings', patch).then(unwrap),
    onSuccess: (data) => {
      qc.setQueryData(['admin', 'settings'], data);
      toast.success('Settings saved');
    },
    onError: (err) => toast.error(toApiError(err).message),
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    save: mutation.mutate,
    saving: mutation.isPending,
  };
}

function SettingsForm({ initial, save, saving, canEdit }) {
  const { register, handleSubmit } = useForm({ defaultValues: initial });
  return (
    <form onSubmit={handleSubmit((v) => save(v))} className="space-y-5">
      <Panel title="Service switches">
        <div className="space-y-4">
          <CheckField
            label="Accepting online orders"
            hint="Turn off when the kitchen is closed or overwhelmed. Customers see a friendly message at checkout."
            disabled={!canEdit}
            {...register('acceptingOrders')}
          />
          <CheckField
            label="Accepting table bookings"
            hint="Pauses new table reservations. Existing ones stay valid."
            disabled={!canEdit}
            {...register('acceptingBookings')}
          />
        </div>
      </Panel>
      <Panel title="Cafe details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Announcement"
            hint="Short notice for customers, e.g. a festival closure"
            disabled={!canEdit}
            {...register('announcement')}
          />
          <Input label="Opening hours" disabled={!canEdit} {...register('openingHours')} />
          <Input label="Contact phone" disabled={!canEdit} {...register('contactPhone')} />
          <Input label="Address" disabled={!canEdit} {...register('address')} />
        </div>
      </Panel>
      {canEdit ? (
        <Button type="submit" size="lg" loading={saving}>
          Save settings
        </Button>
      ) : (
        <p className="text-muted">Only admins can change settings.</p>
      )}
    </form>
  );
}

export default function SettingsPage() {
  const { data, isLoading, save, saving } = useSettings();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-4xl">Settings</h1>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <SettingsForm initial={data} save={save} saving={saving} canEdit={role === 'admin'} />
      )}
    </div>
  );
}
