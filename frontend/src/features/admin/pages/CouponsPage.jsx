import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { fieldError, toApiError } from '../../../lib/apiError.js';
import { api } from '../../../lib/axios.js';
import { formatPrice } from '../../../lib/format.js';
import { toast } from '../../ui/uiStore.js';
import { CheckField, LoadMore, Panel, SelectField, Switch } from '../components/Fields.jsx';
import { flatten, useAdminList } from '../hooks.js';
import { fromLocalInput, paiseToRupees, rupeesToPaise, toLocalInput } from '../money.js';

const opt = (v) => (v === '' || v === undefined ? undefined : Number(v));

function CouponForm({ coupon, onClose, onSaved }) {
  const { register, handleSubmit, control, formState, setError } = useForm({
    defaultValues: {
      code: coupon?.code ?? '',
      description: coupon?.description ?? '',
      type: coupon?.type ?? 'percent',
      value: coupon
        ? coupon.type === 'flat'
          ? paiseToRupees(coupon.value)
          : String(coupon.value)
        : '',
      maxDiscount: paiseToRupees(coupon?.maxDiscount),
      minOrderAmount: paiseToRupees(coupon?.minOrderAmount),
      startsAt: toLocalInput(coupon?.startsAt),
      expiresAt: toLocalInput(coupon?.expiresAt),
      usageLimit: String(coupon?.usageLimit ?? ''),
      perUserLimit: String(coupon?.perUserLimit ?? 1),
      isPublic: coupon?.isPublic ?? false,
      isActive: coupon?.isActive ?? true,
    },
  });
  const type = useWatch({ control, name: 'type' });
  const submit = async (v) => {
    const body = {
      description: v.description || undefined,
      type: v.type,
      value: v.type === 'flat' ? rupeesToPaise(v.value) : Number(v.value),
      maxDiscount: v.type === 'percent' ? rupeesToPaise(v.maxDiscount) : undefined,
      minOrderAmount: rupeesToPaise(v.minOrderAmount),
      startsAt: fromLocalInput(v.startsAt),
      expiresAt: fromLocalInput(v.expiresAt),
      usageLimit: opt(v.usageLimit),
      perUserLimit: opt(v.perUserLimit),
      isPublic: v.isPublic,
      isActive: v.isActive,
    };
    try {
      if (coupon) await api.patch(`/coupons/${coupon._id}`, body);
      else await api.post('/coupons', { code: v.code, ...body });
      toast.success('Coupon saved');
      onSaved();
      onClose();
    } catch (err) {
      const a = toApiError(err);
      ['code', 'value'].forEach((f) => {
        const m = fieldError(a.details, f);
        if (m) setError(f, { message: m });
      });
      setError('root', { message: a.message });
    }
  };
  return (
    <Modal open onClose={onClose} title={coupon ? `Edit ${coupon.code}` : 'New coupon'} size="lg">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            disabled={Boolean(coupon)}
            hint="A–Z, 0–9, _ or -"
            error={formState.errors.code?.message}
            {...register('code', { required: true })}
          />
          <SelectField label="Type" {...register('type')}>
            <option value="percent">Percent off</option>
            <option value="flat">Flat ₹ off</option>
          </SelectField>
          <Input
            label={type === 'percent' ? 'Percent (1–100)' : 'Amount (₹)'}
            inputMode="decimal"
            error={formState.errors.value?.message}
            {...register('value', { required: true })}
          />
          {type === 'percent' && (
            <Input label="Max discount (₹)" inputMode="decimal" {...register('maxDiscount')} />
          )}
          <Input label="Minimum order (₹)" inputMode="decimal" {...register('minOrderAmount')} />
          <Input
            label="Total uses (blank = unlimited)"
            inputMode="numeric"
            {...register('usageLimit')}
          />
          <Input label="Uses per customer" inputMode="numeric" {...register('perUserLimit')} />
          <Input label="Starts" type="datetime-local" {...register('startsAt')} />
          <Input label="Expires" type="datetime-local" {...register('expiresAt')} />
        </div>
        <Input label="Description (shown to customers)" {...register('description')} />
        <div className="flex flex-wrap gap-6">
          <CheckField label="Show in offers" {...register('isPublic')} />
          <CheckField label="Active" {...register('isActive')} />
        </div>
        {formState.errors.root && (
          <p role="alert" className="font-medium text-nonveg">
            {formState.errors.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save coupon
        </Button>
      </form>
    </Modal>
  );
}

export default function CouponsPage() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(null);
  const list = useAdminList(['coupons'], '/coupons/manage');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/coupons/${id}`, { isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(toApiError(e).message),
  });
  const describe = (c) =>
    c.type === 'percent'
      ? `${c.value}% off${c.maxDiscount ? ` up to ${formatPrice(c.maxDiscount)}` : ''}`
      : `${formatPrice(c.value)} off`;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-4xl">Coupons</h1>
        <Button onClick={() => setEdit('new')}>+ New coupon</Button>
      </div>
      <Panel>
        <ul className="divide-y divide-line">
          {flatten(list.data).map((c) => (
            <li key={c._id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-lg font-bold">
                  {c.code} {c.isPublic && <Badge tone="success">Public</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {describe(c)}
                  {c.minOrderAmount ? ` · min ${formatPrice(c.minOrderAmount)}` : ''} · used{' '}
                  {c.usedCount}
                  {c.usageLimit ? `/${c.usageLimit}` : ''}
                  {c.expiresAt
                    ? ` · expires ${new Date(c.expiresAt).toLocaleDateString('en-IN')}`
                    : ''}
                </p>
              </div>
              <Switch
                checked={c.isActive}
                onChange={(v) => toggle.mutate({ id: c._id, isActive: v })}
                label={`${c.code} active`}
              />
              <Button size="sm" variant="outline" onClick={() => setEdit(c)}>
                Edit
              </Button>
            </li>
          ))}
          {list.isLoading && <li className="py-6 text-center">Loading…</li>}
          {!list.isLoading && flatten(list.data).length === 0 && (
            <li className="py-8 text-center text-muted">No coupons yet.</li>
          )}
        </ul>
        <LoadMore query={list} />
      </Panel>
      {edit && (
        <CouponForm
          coupon={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
