import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import QuantityStepper from '../../../components/ui/QuantityStepper.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatPrice } from '../../../lib/format.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { newIdempotencyKey } from '../../../lib/id.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { openCheckout } from '../../orders/payment.js';
import { toast } from '../../ui/uiStore.js';
import { createBooking, fetchSlots, startDeposit } from '../api.js';
import { chipLabel, longDate, nextDates, time12 } from '../dates.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name for the booking').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  note: z.string().trim().max(300).optional(),
});

/** Contact details + submit. Mounted per user so the prefill is correct once the session loads. */
function DetailsForm({ user, authed, chosen, guests, date, deposit, busy, onSubmit }) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone?.replace('+91', '') ?? '',
      note: '',
    },
  });
  const e = form.formState.errors;
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="card mt-8 space-y-4 p-5"
      aria-labelledby="details-h"
    >
      <h2 id="details-h" className="text-2xl">
        4. Your details
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name"
          autoComplete="name"
          error={e.name?.message}
          {...form.register('name')}
        />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          error={e.phone?.message}
          {...form.register('phone')}
        />
      </div>
      <div>
        <label htmlFor="bk-note" className="mb-1.5 block text-sm font-bold">
          Special request <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="bk-note"
          rows={2}
          maxLength={300}
          className="w-full rounded-xl border-2 border-line bg-surface p-3 focus:border-kulhad focus:outline-none"
          {...form.register('note')}
        />
      </div>
      <div className="rounded-xl bg-surface-2 p-4">
        <p className="font-bold">
          Table for {guests} · {longDate(date)} · {time12(chosen.startTime)}
        </p>
        {deposit > 0 ? (
          <p className="text-sm text-muted">
            Refundable deposit of <strong>{formatPrice(deposit)}</strong> confirms your table. Seats
            are held for 10 minutes while you pay.
          </p>
        ) : (
          <p className="text-sm text-muted">
            No payment needed. Your table is confirmed instantly.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {authed
          ? deposit > 0
            ? `Pay ${formatPrice(deposit)} & confirm`
            : 'Confirm booking'
          : 'Login to book'}
      </Button>
    </form>
  );
}

/** Pick a date, party size and slot (live seat counts), then book. Deposit slots go straight to payment. */
export default function BookTablePage() {
  const user = useAuthStore((s) => s.user);
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const navigate = useNavigate();
  const dates = useMemo(() => nextDates(14), []);
  const [date, setDate] = useState(dates[0]);
  const [guests, setGuests] = useState(2);
  const [slotId, setSlotId] = useState(null);
  const grid = useRef(null);

  const slotsQuery = useQuery({
    queryKey: keys.slots(date),
    queryFn: () => fetchSlots(date),
    refetchInterval: 15_000, // seats are live: keep the grid honest
    staleTime: 5_000,
  });
  const slots = slotsQuery.data ?? [];
  const chosen = slots.find((s) => s.slotId === slotId);
  const fits = (s) => s.bookable && s.remaining >= guests && guests <= s.maxPartySize;
  const maxGuests = Math.max(...slots.map((s) => s.maxPartySize), 10);

  // A previously chosen slot may stop fitting (date/guests change or someone else took the seats).
  useEffect(() => {
    if (slotId && !(chosen && fits(chosen))) setSlotId(null);
  }, [slots, guests]); // eslint-disable-line react-hooks/exhaustive-deps

  useGSAP(
    () => {
      if (!prefersReducedMotion())
        gsap.from('[data-slot]', { opacity: 0, y: 14, stagger: 0.05, duration: 0.35 });
    },
    { scope: grid, dependencies: [date, slotsQuery.isSuccess], revertOnUpdate: true },
  );

  const idemKey = useRef({ sig: '', key: '' });
  const submit = useMutation({
    mutationFn: async (values) => {
      const body = {
        slotId,
        date,
        guests,
        name: values.name,
        phone: values.phone,
        note: values.note || undefined,
      };
      const sig = JSON.stringify(body);
      if (idemKey.current.sig !== sig) idemKey.current = { sig, key: newIdempotencyKey() };
      return createBooking(body, idemKey.current.key);
    },
    onSuccess: async (booking) => {
      if (booking.status === 'HELD') {
        try {
          const gateway = await startDeposit(booking._id, newIdempotencyKey());
          const res = await openCheckout(gateway, { name: booking.name, phone: booking.phone });
          if (res.status === 'dismissed')
            toast.info('Seats are held for 10 minutes. Pay the deposit to confirm.');
        } catch (err) {
          toast.error(toApiError(err).message);
        }
      }
      navigate(`/bookings/${booking._id}?confirmed=1`, { replace: true });
    },
    onError: (err) => {
      toast.error(toApiError(err).message);
      slotsQuery.refetch();
    },
  });

  const onSubmit = (values) => {
    if (!authed) return navigate('/login', { state: { from: { pathname: '/book-table' } } });
    return submit.mutateAsync(values).catch(() => {});
  };

  const deposit = chosen ? chosen.depositPerGuest * guests : 0;

  return (
    <div className="container-page max-w-3xl py-8">
      <Seo
        title="Book a table"
        description="Reserve a table at Jail Ki Chai. Pick a date, time and party size; instant confirmation."
      />
      <h1 className="text-4xl sm:text-5xl">Book a table</h1>
      <p className="mt-2 text-muted">
        Grab a cell by the window. Free cancellation until 2 hours before.
      </p>

      <section className="mt-8" aria-labelledby="date-h">
        <h2 id="date-h" className="mb-3 text-2xl">
          1. Pick a date
        </h2>
        <div
          role="radiogroup"
          aria-label="Date"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
        >
          {dates.map((d) => {
            const l = chipLabel(d);
            const on = d === date;
            return (
              <button
                key={d}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setDate(d);
                  setSlotId(null);
                }}
                className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-2xl border-2 px-2 py-2 ${on ? 'border-kulhad bg-kulhad text-white dark:border-saffron dark:bg-saffron dark:text-iron' : 'border-line bg-surface'}`}
              >
                <span className="text-xs font-bold">{l.top}</span>
                <span className="text-2xl font-bold leading-tight">{l.day}</span>
                <span className="text-xs">{l.month}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="guests-h">
        <h2 id="guests-h" className="mb-3 text-2xl">
          2. How many guests?
        </h2>
        <QuantityStepper
          value={guests}
          min={1}
          max={Math.min(maxGuests, 20)}
          label="guests"
          onChange={setGuests}
        />
        {guests >= 8 && (
          <p className="mt-2 text-sm text-muted">
            Planning something bigger? Check our party packages.
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="slot-h">
        <h2 id="slot-h" className="mb-3 text-2xl">
          3. Choose a time{' '}
          <span className="text-base font-normal text-muted">· {longDate(date)}</span>
        </h2>
        {slotsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : slotsQuery.isError ? (
          <ErrorState
            message="We couldn't load the available times."
            onRetry={slotsQuery.refetch}
          />
        ) : slots.length === 0 ? (
          <EmptyState
            icon="🌙"
            title="No tables this day"
            message="We're not taking bookings for this date. Try another day."
          />
        ) : (
          <div
            ref={grid}
            role="radiogroup"
            aria-label="Time slot"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {slots.map((s) => {
              const ok = fits(s);
              const on = s.slotId === slotId;
              return (
                <button
                  key={s.slotId}
                  data-slot
                  role="radio"
                  aria-checked={on}
                  disabled={!ok}
                  onClick={() => setSlotId(s.slotId)}
                  className={`card p-4 text-left disabled:opacity-50 ${on ? 'ring-2 ring-kulhad dark:ring-saffron' : ''}`}
                >
                  <p className="text-xl font-bold">{time12(s.startTime)}</p>
                  <p className="text-sm text-muted">
                    {s.label} · till {time12(s.endTime)}
                  </p>
                  <p
                    className={`mt-2 text-sm font-bold ${s.remaining === 0 ? 'text-nonveg' : s.remaining <= 6 ? 'text-amber-600' : 'text-veg'}`}
                  >
                    {!s.bookable && s.remaining > 0
                      ? 'Closed for booking'
                      : s.remaining === 0
                        ? 'Fully booked'
                        : s.remaining < guests
                          ? `Only ${s.remaining} seats left`
                          : `${s.remaining} seats left`}
                  </p>
                  {s.depositPerGuest > 0 && (
                    <p className="text-xs text-muted">
                      Deposit {formatPrice(s.depositPerGuest)}/guest
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {chosen && (
        <DetailsForm
          key={user?._id ?? 'guest'}
          user={user}
          authed={authed}
          chosen={chosen}
          guests={guests}
          date={date}
          deposit={deposit}
          busy={submit.isPending}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}
