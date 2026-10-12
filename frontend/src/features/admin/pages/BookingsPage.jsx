import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api, unwrap, unwrapWithMeta } from '../../../lib/axios.js';
import { formatPrice } from '../../../lib/format.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { useAuthStore } from '../../auth/authStore.js';
import { istDate, longDate, time12 } from '../../booking/dates.js';
import { BOOKING_LABEL, BOOKING_TONE } from '../../booking/status.js';
import { toast } from '../../ui/uiStore.js';
import { CheckField, Panel } from '../components/Fields.jsx';
import { paiseToRupees, rupeesToPaise } from '../money.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Month grid cells (null padding + YYYY-MM-DD). */
export function monthCells(month) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [
    ...Array(first.getUTCDay()).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
}
const shiftMonth = (month, n) => {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

function SlotForm({ slot, onClose, onSaved }) {
  const { register, handleSubmit, formState, setError } = useForm({
    defaultValues: {
      label: slot?.label ?? '',
      startTime: slot?.startTime ?? '19:00',
      endTime: slot?.endTime ?? '21:00',
      capacity: String(slot?.capacity ?? 30),
      maxPartySize: String(slot?.maxPartySize ?? 10),
      depositPerGuest: paiseToRupees(slot?.depositPerGuest ?? 0),
      days: DOW.map((_, i) => (slot ? slot.daysOfWeek.includes(i) : true)),
      isActive: slot?.isActive ?? true,
    },
  });
  const submit = async (v) => {
    const body = {
      label: v.label,
      startTime: v.startTime,
      endTime: v.endTime,
      capacity: Number(v.capacity),
      maxPartySize: Number(v.maxPartySize),
      depositPerGuest: rupeesToPaise(v.depositPerGuest || '0'),
      daysOfWeek: v.days.map((on, i) => (on ? i : null)).filter((x) => x !== null),
      isActive: v.isActive,
    };
    try {
      if (slot) await api.patch(`/booking-slots/${slot._id}`, body);
      else await api.post('/booking-slots', body);
      toast.success('Slot saved');
      onSaved();
      onClose();
    } catch (err) {
      setError('root', { message: toApiError(err).message });
    }
  };
  return (
    <Modal open onClose={onClose} title={slot ? 'Edit slot' : 'New slot'}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input label="Label" {...register('label', { required: true })} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Starts" type="time" {...register('startTime')} />
          <Input label="Ends" type="time" {...register('endTime')} />
          <Input label="Seats" type="number" min={1} {...register('capacity')} />
          <Input label="Max party size" type="number" min={1} {...register('maxPartySize')} />
        </div>
        <Input
          label="Deposit per guest (₹, 0 = none)"
          inputMode="decimal"
          {...register('depositPerGuest')}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Days offered</legend>
          <div className="flex flex-wrap gap-3">
            {DOW.map((d, i) => (
              <CheckField key={d} label={d} {...register(`days.${i}`)} />
            ))}
          </div>
        </fieldset>
        <CheckField label="Active" {...register('isActive')} />
        {formState.errors.root && (
          <p role="alert" className="font-medium text-nonveg">
            {formState.errors.root.message}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save slot
        </Button>
      </form>
    </Modal>
  );
}

export default function BookingsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const today = istDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [slotEdit, setSlotEdit] = useState(null);

  const cal = useQuery({
    queryKey: ['admin', 'bookings', 'calendar', month],
    queryFn: () => api.get('/table-bookings/manage/calendar', { params: { month } }).then(unwrap),
  });
  const day = useQuery({
    queryKey: ['admin', 'bookings', 'day', date],
    queryFn: () => api.get('/table-bookings/manage', { params: { date } }).then(unwrapWithMeta),
    refetchInterval: 30_000,
  });
  const slots = useQuery({
    queryKey: ['admin', 'bookings', 'slots'],
    queryFn: () => api.get('/booking-slots/manage').then(unwrap),
    enabled: isAdmin,
  });
  const counts = useMemo(() => new Map((cal.data ?? []).map((c) => [c.date, c])), [cal.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });

  const outcome = useMutation({
    mutationFn: ({ id, status }) =>
      api.patch(`/table-bookings/${id}/outcome`, { status }).then(unwrap),
    onSuccess: refresh,
    onError: (e) => toast.error(toApiError(e).message),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }) =>
      api.post(`/table-bookings/${id}/cancel`, { reason }).then(unwrap),
    onSuccess: () => {
      toast.success('Booking cancelled');
      refresh();
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const grid = useMemo(() => monthCells(month), [month]);
  const [y, m] = month.split('-').map(Number);
  useGSAP(
    () => {
      if (!prefersReducedMotion())
        gsap.from('[data-cell]', { opacity: 0, scale: 0.92, stagger: 0.008, duration: 0.25 });
    },
    { dependencies: [month] },
  );

  return (
    <div className="space-y-5">
      <h1 className="text-4xl">Table bookings</h1>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Panel
          title={`${MONTHS[m - 1]} ${y}`}
          actions={
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                ‹
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setDate(today);
                }}
              >
                Today
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                ›
              </Button>
            </div>
          }
        >
          <div
            role="grid"
            aria-label="Booking calendar"
            className="grid grid-cols-7 gap-1.5 text-center"
          >
            {DOW.map((d) => (
              <div key={d} role="columnheader" className="pb-1 text-xs font-bold text-muted">
                {d}
              </div>
            ))}
            {grid.map((d, i) => {
              if (!d) return <div key={`pad-${i}`} role="gridcell" />;
              const c = counts.get(d);
              const sel = d === date;
              return (
                <button
                  key={d}
                  data-cell
                  role="gridcell"
                  aria-selected={sel}
                  aria-label={`${longDate(d)}${c ? `, ${c.bookings} bookings, ${c.guests} guests` : ', no bookings'}`}
                  onClick={() => setDate(d)}
                  className={`aspect-square rounded-xl border-2 p-1 text-sm ${sel ? 'border-kulhad bg-surface-2' : 'border-transparent hover:bg-surface-2'} ${d === today ? 'font-bold ring-1 ring-saffron' : ''}`}
                >
                  <span className="block">{Number(d.slice(8))}</span>
                  {c && (
                    <span className="mt-0.5 inline-block rounded-full bg-kulhad px-1.5 text-[11px] font-bold text-white">
                      {c.bookings}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title={longDate(date)}>
          {day.isLoading ? (
            <p>Loading…</p>
          ) : (day.data?.data ?? []).length === 0 ? (
            <p className="text-muted">No bookings on this day.</p>
          ) : (
            <ul className="space-y-3">
              {day.data.data.map((b) => (
                <li key={b._id} className="rounded-xl border-2 border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {time12(b.slot.startTime)} · {b.guests} guests
                      </p>
                      <p className="text-sm">
                        {b.name} · {b.phone}
                      </p>
                      <p className="text-xs text-muted">{b.bookingNumber}</p>
                    </div>
                    <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
                  </div>
                  {b.note && <p className="mt-1 text-sm italic text-muted">“{b.note}”</p>}
                  {b.deposit?.amount > 0 && (
                    <p className="mt-1 text-sm">
                      Deposit {formatPrice(b.deposit.amount)} · {b.deposit.status}
                    </p>
                  )}
                  {['CONFIRMED', 'HELD'].includes(b.status) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {b.status === 'CONFIRMED' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => outcome.mutate({ id: b._id, status: 'COMPLETED' })}
                          >
                            Seated / done
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => outcome.mutate({ id: b._id, status: 'NO_SHOW' })}
                          >
                            No-show
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const reason = window.prompt('Reason for cancelling (sent to the guest)');
                          if (reason !== null)
                            cancel.mutate({ id: b._id, reason: reason || 'Cancelled by the cafe' });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {isAdmin && (
        <Panel
          title="Time slots"
          actions={
            <Button size="sm" onClick={() => setSlotEdit('new')}>
              + New slot
            </Button>
          }
        >
          <ul className="divide-y divide-line">
            {(slots.data ?? []).map((s) => (
              <li key={s._id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {s.label} {!s.isActive && <Badge tone="danger">Off</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {time12(s.startTime)}–{time12(s.endTime)} · {s.capacity} seats · max{' '}
                    {s.maxPartySize} ·{' '}
                    {s.depositPerGuest
                      ? `${formatPrice(s.depositPerGuest)}/guest deposit`
                      : 'no deposit'}{' '}
                    ·{' '}
                    {s.daysOfWeek.length === 7
                      ? 'daily'
                      : s.daysOfWeek.map((d) => DOW[d]).join(' ')}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSlotEdit(s)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {slotEdit && (
        <SlotForm
          slot={slotEdit === 'new' ? null : slotEdit}
          onClose={() => setSlotEdit(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
