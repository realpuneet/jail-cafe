import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api, unwrap } from '../../../lib/axios.js';
import { formatDateTime, formatPrice } from '../../../lib/format.js';
import { useAuthStore } from '../../auth/authStore.js';
import { longDate } from '../../booking/dates.js';
import { EVENT_TYPES, PARTY_LABEL, PARTY_TONE } from '../../party/status.js';
import { toast } from '../../ui/uiStore.js';
import { CheckField, LoadMore, Panel, SelectField, TextAreaField } from '../components/Fields.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { flatten, useAdminList } from '../hooks.js';
import { paiseToRupees, rupeesToPaise } from '../money.js';

const FILTERS = [
  ['', 'All'],
  ['SUBMITTED', 'New'],
  ['QUOTED', 'Quoted'],
  ['ACCEPTED', 'Awaiting token'],
  ['CONFIRMED', 'Confirmed'],
];

function InquiryModal({ id, onClose }) {
  const qc = useQueryClient();
  const { data: i, refetch } = useQuery({
    queryKey: ['admin', 'party', id],
    queryFn: () => api.get(`/party-inquiries/${id}`).then(unwrap),
  });
  const { register, handleSubmit, formState } = useForm({
    values: {
      amount: paiseToRupees(i?.quote?.amount),
      token: paiseToRupees(i?.quote?.tokenAmount),
      validDays: '3',
      notes: i?.quote?.notes ?? '',
    },
  });
  const done = (msg) => () => {
    toast.success(msg);
    refetch();
    qc.invalidateQueries({ queryKey: ['admin', 'party'] });
  };
  const fail = (e) => toast.error(toApiError(e).message);
  const quote = useMutation({
    mutationFn: (v) =>
      api
        .patch(`/party-inquiries/${id}/quote`, {
          amount: rupeesToPaise(v.amount),
          tokenAmount: rupeesToPaise(v.token),
          validDays: Number(v.validDays || 3),
          notes: v.notes || undefined,
        })
        .then(unwrap),
    onSuccess: done('Quote sent'),
    onError: fail,
  });
  const close = useMutation({
    mutationFn: (reason) => api.post(`/party-inquiries/${id}/close`, { reason }).then(unwrap),
    onSuccess: done('Inquiry closed'),
    onError: fail,
  });
  const complete = useMutation({
    mutationFn: () => api.post(`/party-inquiries/${id}/complete`).then(unwrap),
    onSuccess: done('Marked completed'),
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (p) => api.post(`/party-inquiries/${id}/cancel`, p).then(unwrap),
    onSuccess: done('Cancelled'),
    onError: fail,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={i ? `${i.inquiryNumber} · ${i.name}` : 'Inquiry'}
      size="lg"
    >
      {!i ? (
        <p>Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PARTY_TONE[i.status]}>{PARTY_LABEL[i.status]}</Badge>
            <span className="capitalize text-muted">
              {i.eventType}
              {i.package?.name ? ` · ${i.package.name}` : ''}
            </span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Event date</dt>
              <dd className="font-bold">
                {longDate(i.eventDate)}
                {i.startTime ? ` · ${i.startTime}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Guests</dt>
              <dd className="font-bold">
                {i.guests}
                {i.package?.pricePerGuest ? (
                  <span className="font-normal text-muted">
                    {' '}
                    (≈ {formatPrice(i.package.pricePerGuest * i.guests)} at package rate)
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Contact</dt>
              <dd className="font-bold">
                <a className="underline" href={`tel:${i.phone}`}>
                  {i.phone}
                </a>
                {i.email ? ` · ${i.email}` : ''}
              </dd>
            </div>
            {i.token.amount > 0 && (
              <div>
                <dt className="text-sm text-muted">Token</dt>
                <dd className="font-bold">
                  {formatPrice(i.token.amount)} · {i.token.status}
                </dd>
              </div>
            )}
            {i.requirements && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted">Requirements</dt>
                <dd>{i.requirements}</dd>
              </div>
            )}
          </dl>

          {['SUBMITTED', 'QUOTED'].includes(i.status) && (
            <form
              onSubmit={handleSubmit((v) => quote.mutate(v))}
              className="space-y-3 rounded-xl border-2 border-line p-4"
            >
              <h3 className="font-sans text-lg font-bold">
                {i.status === 'QUOTED' ? `Revise quote (v${i.quote.version})` : 'Send a quote'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Total (₹)"
                  inputMode="decimal"
                  required
                  {...register('amount', { required: true })}
                />
                <Input
                  label="Token (₹)"
                  inputMode="decimal"
                  hint="Blank = 25%"
                  {...register('token')}
                />
                <Input label="Valid for (days)" inputMode="numeric" {...register('validDays')} />
              </div>
              <TextAreaField label="Notes to the customer" {...register('notes')} />
              <Button type="submit" loading={quote.isPending || formState.isSubmitting}>
                {i.status === 'QUOTED' ? 'Send revised quote' : 'Send quote'}
              </Button>
            </form>
          )}
          {i.quote?.amount > 0 && i.status !== 'SUBMITTED' && (
            <p className="rounded-xl bg-surface-2 p-3 text-sm">
              Current quote: <strong>{formatPrice(i.quote.amount)}</strong> · token{' '}
              {formatPrice(i.quote.tokenAmount)} · valid until {formatDateTime(i.quote.validUntil)}
            </p>
          )}

          <div>
            <h3 className="mb-2 font-sans text-lg font-bold">Timeline</h3>
            <ol className="space-y-1 text-sm">
              {i.statusHistory.map((h, idx) => (
                <li key={idx}>
                  <strong>{PARTY_LABEL[h.status]}</strong>{' '}
                  <span className="text-muted">
                    · {formatDateTime(h.at)}
                    {h.note ? ` · ${h.note}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            {i.status === 'CONFIRMED' && (
              <Button loading={complete.isPending} onClick={() => complete.mutate()}>
                Mark completed
              </Button>
            )}
            {['SUBMITTED', 'QUOTED', 'ACCEPTED'].includes(i.status) && (
              <Button
                variant="outline"
                onClick={() => {
                  const r = window.prompt(
                    "Reason we can't host this event (shown to the customer)",
                  );
                  if (r !== null) close.mutate(r);
                }}
              >
                Can&apos;t host
              </Button>
            )}
            {['ACCEPTED', 'CONFIRMED'].includes(i.status) && (
              <Button
                variant="danger"
                onClick={() => {
                  const r = window.prompt('Reason for cancelling');
                  if (r === null) return;
                  cancel.mutate({
                    reason: r,
                    refund:
                      i.token.status !== 'paid'
                        ? undefined
                        : window.confirm('Refund the token to the customer?'),
                  });
                }}
              >
                Cancel party
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PackageForm({ pkg, onClose, onSaved }) {
  const [image, setImage] = useState(pkg?.image ?? null);
  const { register, handleSubmit, formState, setError } = useForm({
    defaultValues: {
      name: pkg?.name ?? '',
      type: pkg?.type ?? 'birthday',
      tagline: pkg?.tagline ?? '',
      description: pkg?.description ?? '',
      pricePerGuest: paiseToRupees(pkg?.pricePerGuest),
      minGuests: String(pkg?.minGuests ?? 10),
      maxGuests: String(pkg?.maxGuests ?? 60),
      durationHours: String(pkg?.durationHours ?? 3),
      inclusions: (pkg?.inclusions ?? []).join('\n'),
      isActive: pkg?.isActive ?? true,
    },
  });
  const submit = async (v) => {
    const body = {
      name: v.name,
      type: v.type,
      tagline: v.tagline || undefined,
      description: v.description || undefined,
      image: image ?? undefined,
      pricePerGuest: rupeesToPaise(v.pricePerGuest),
      minGuests: Number(v.minGuests),
      maxGuests: Number(v.maxGuests),
      durationHours: Number(v.durationHours),
      inclusions: v.inclusions
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      isActive: v.isActive,
    };
    try {
      if (pkg) await api.patch(`/party-packages/${pkg._id}`, body);
      else await api.post('/party-packages', body);
      toast.success('Package saved');
      onSaved();
      onClose();
    } catch (err) {
      setError('root', { message: toApiError(err).message });
    }
  };
  return (
    <Modal open onClose={onClose} title={pkg ? 'Edit package' : 'New package'} size="lg">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <ImageUploader value={image} onChange={setImage} folder="party" label="Photo" />
        <Input label="Name" {...register('name', { required: true })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Occasion" {...register('type')}>
            {EVENT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <Input
            label="Price per guest (₹)"
            inputMode="decimal"
            {...register('pricePerGuest', { required: true })}
          />
          <Input label="Min guests" type="number" {...register('minGuests')} />
          <Input label="Max guests" type="number" {...register('maxGuests')} />
          <Input label="Duration (hours)" type="number" {...register('durationHours')} />
        </div>
        <Input label="Tagline" {...register('tagline')} />
        <TextAreaField label="Description" {...register('description')} />
        <TextAreaField label="Inclusions (one per line)" rows={4} {...register('inclusions')} />
        <CheckField label="Active (visible to customers)" {...register('isActive')} />
        {formState.errors.root && (
          <p role="alert" className="font-medium text-nonveg">
            {formState.errors.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save package
        </Button>
      </form>
    </Modal>
  );
}

export default function PartyAdminPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('inbox');
  const [editPkg, setEditPkg] = useState(null);
  const inbox = useAdminList(
    ['party', 'inbox'],
    '/party-inquiries/manage',
    status ? { status } : {},
  );
  const pkgs = useAdminList(['party', 'packages'], '/party-packages/manage');
  const items = flatten(inbox.data);
  const removePkg = useMutation({
    mutationFn: (id) => api.delete(`/party-packages/${id}`),
    onSuccess: () => {
      toast.success('Package removed');
      qc.invalidateQueries({ queryKey: ['admin', 'party'] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl">Party bookings</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <div
              role="group"
              aria-label="Section"
              className="flex rounded-full border-2 border-line p-0.5"
            >
              {[
                ['inbox', 'Inquiries'],
                ['packages', 'Packages'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                  className={`rounded-full px-4 py-1.5 font-bold ${tab === k ? 'bg-chai-700 text-white dark:bg-saffron dark:text-iron' : ''}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {tab === 'packages' && <Button onClick={() => setEditPkg('new')}>+ New package</Button>}
          </div>
        )}
      </div>

      {tab === 'inbox' ? (
        <>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.map(([v, l]) => (
              <button
                key={v}
                aria-pressed={status === v}
                onClick={() => setStatus(v)}
                className={`rounded-full border-2 px-4 py-1.5 font-bold ${status === v ? 'border-kulhad bg-kulhad text-white dark:border-saffron dark:bg-saffron dark:text-iron' : 'border-line'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <Panel>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i._id}>
                  <button
                    onClick={() => setOpen(i._id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:bg-surface-2/50"
                  >
                    <div>
                      <p className="font-bold">
                        {i.inquiryNumber} · {i.name}
                      </p>
                      <p className="text-sm capitalize text-muted">
                        {i.eventType} · {longDate(i.eventDate)} · {i.guests} guests
                        {i.package?.name ? ` · ${i.package.name}` : ''}
                      </p>
                    </div>
                    <Badge tone={PARTY_TONE[i.status]}>{PARTY_LABEL[i.status]}</Badge>
                  </button>
                </li>
              ))}
              {inbox.isLoading && <li className="py-6 text-center">Loading…</li>}
              {!inbox.isLoading && items.length === 0 && (
                <li className="py-8 text-center text-muted">No inquiries here.</li>
              )}
            </ul>
            <LoadMore query={inbox} />
          </Panel>
        </>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {flatten(pkgs.data).map((p) => (
              <li key={p._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {p.name} {!p.isActive && <Badge tone="danger">Hidden</Badge>}
                  </p>
                  <p className="text-sm capitalize text-muted">
                    {p.type} · {formatPrice(p.pricePerGuest)}/guest · {p.minGuests}-{p.maxGuests}{' '}
                    guests
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditPkg(p)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.confirm(`Hide ${p.name}?`) && removePkg.mutate(p._id)}
                >
                  Hide
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {open && <InquiryModal id={open} onClose={() => setOpen(null)} />}
      {editPkg && (
        <PackageForm
          pkg={editPkg === 'new' ? null : editPkg}
          onClose={() => setEditPkg(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'party'] });
            qc.invalidateQueries({ queryKey: ['party-packages'] });
          }}
        />
      )}
    </div>
  );
}
