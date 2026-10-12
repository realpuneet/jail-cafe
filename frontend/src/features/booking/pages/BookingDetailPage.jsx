import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatPrice } from '../../../lib/format.js';
import { newIdempotencyKey } from '../../../lib/id.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import OrderSuccess from '../../orders/components/OrderSuccess.jsx';
import { openCheckout } from '../../orders/payment.js';
import { toast } from '../../ui/uiStore.js';
import { cancelBooking, fetchBooking, startDeposit } from '../api.js';
import { icsFor, longDate, time12 } from '../dates.js';
import { BOOKING_LABEL, BOOKING_TONE } from '../status.js';

function HoldCountdown({ until, onExpire }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) onExpire?.();
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpire]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className="font-bold tabular-nums">
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const {
    data: b,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: keys.booking(id),
    queryFn: () => fetchBooking(id),
    refetchInterval: (q) => (q.state.data?.status === 'HELD' ? 5000 : false),
  });
  const [paying, setPaying] = useState(false);

  const cancel = useMutation({
    mutationFn: () => cancelBooking(id, 'Cancelled by customer'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.booking(id) });
      qc.invalidateQueries({ queryKey: keys.bookings });
      toast.success('Booking cancelled');
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const payDeposit = async () => {
    setPaying(true);
    try {
      const gateway = await startDeposit(id, newIdempotencyKey());
      const res = await openCheckout(gateway, { name: b.name, phone: user?.phone });
      if (res.status === 'paid') toast.success('Deposit received');
      refetch();
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setPaying(false);
    }
  };

  const downloadIcs = () => {
    const url = URL.createObjectURL(new Blob([icsFor(b)], { type: 'text/calendar' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${b.bookingNumber}.ics`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading)
    return (
      <div
        className="container-page max-w-2xl space-y-4 py-8"
        role="status"
        aria-label="Loading booking"
      >
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  if (isError && error?.response?.status === 404)
    return (
      <EmptyState
        icon="🔍"
        title="Booking not found"
        action={<Button to="/bookings">My bookings</Button>}
      />
    );
  if (isError) return <ErrorState onRetry={refetch} />;

  const live = b.status === 'HELD' || b.status === 'CONFIRMED';
  return (
    <div className="container-page max-w-2xl space-y-6 py-8">
      <Seo title={`Booking ${b.bookingNumber}`} noindex />
      {params.get('confirmed') === '1' && b.status === 'CONFIRMED' && (
        <OrderSuccess
          title="Table booked!"
          message={
            <>
              See you on <strong>{longDate(b.date)}</strong> at{' '}
              <strong>{time12(b.slot.startTime)}</strong>.
            </>
          }
          onDone={() => setParams({}, { replace: true })}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Booking</p>
          <h1 className="text-3xl sm:text-4xl">{b.bookingNumber}</h1>
        </div>
        <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
      </header>

      {b.status === 'HELD' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-100 p-4 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100"
        >
          <p>
            Seats held for <HoldCountdown until={b.holdExpiresAt} onExpire={refetch} />. Pay the
            deposit to confirm.
          </p>
          <Button onClick={payDeposit} loading={paying}>
            Pay {formatPrice(b.deposit.amount)}
          </Button>
        </div>
      )}
      {b.status === 'EXPIRED' && (
        <p
          role="alert"
          className="rounded-2xl bg-red-100 p-4 font-medium text-red-900 dark:bg-red-900/30 dark:text-red-100"
        >
          The hold expired before the deposit was paid. Please book again.
        </p>
      )}

      <section className="card space-y-3 p-6" aria-label="Booking details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Date</dt>
            <dd className="text-lg font-bold">{longDate(b.date)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Time</dt>
            <dd className="text-lg font-bold">
              {time12(b.slot.startTime)} – {time12(b.slot.endTime)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Guests</dt>
            <dd className="text-lg font-bold">{b.guests}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Name</dt>
            <dd className="text-lg font-bold">{b.name}</dd>
          </div>
          {b.deposit.amount > 0 && (
            <div>
              <dt className="text-sm text-muted">Deposit</dt>
              <dd className="text-lg font-bold">
                {formatPrice(b.deposit.amount)} · {b.deposit.status.replace('_', ' ')}
              </dd>
            </div>
          )}
          {b.note && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Request</dt>
              <dd>{b.note}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        {b.status === 'CONFIRMED' && (
          <Button variant="outline" onClick={downloadIcs}>
            Add to calendar
          </Button>
        )}
        {live && (
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => window.confirm('Cancel this booking?') && cancel.mutate()}
          >
            Cancel booking
          </Button>
        )}
        <Button variant="ghost" to="/bookings">
          All bookings
        </Button>
        <Link
          to="/book-table"
          className="inline-flex h-11 items-center px-3 font-bold text-brand underline"
        >
          Book another
        </Link>
      </div>
    </div>
  );
}
