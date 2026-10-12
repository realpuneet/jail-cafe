import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatDateTime, formatPrice } from '../../../lib/format.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { newIdempotencyKey } from '../../../lib/id.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { longDate } from '../../booking/dates.js';
import OrderSuccess from '../../orders/components/OrderSuccess.jsx';
import { openCheckout } from '../../orders/payment.js';
import { toast } from '../../ui/uiStore.js';
import {
  acceptQuote,
  cancelInquiry,
  declineQuote,
  fetchInquiry,
  startTokenPayment,
} from '../api.js';
import { isOpen, PARTY_LABEL, PARTY_STEPS, PARTY_TONE, STEP_TEXT } from '../status.js';

/** Horizontal/vertical progress of the happy path; the fill animates with scale (transform only). */
function Timeline({ status, history }) {
  const root = useRef(null);
  const reached = PARTY_STEPS.map((s) => history.some((h) => h.status === s));
  const idx = Math.max(reached.lastIndexOf(true), 0);
  const progress = idx / (PARTY_STEPS.length - 1);
  useGSAP(
    () => {
      const fill = root.current.querySelector('[data-fill]');
      if (prefersReducedMotion()) gsap.set(fill, { scaleY: progress });
      else gsap.to(fill, { scaleY: progress, duration: 0.9, ease: 'power3.inOut' });
    },
    { scope: root, dependencies: [progress] },
  );
  const at = (s) => history.find((h) => h.status === s)?.at;
  return (
    <ol ref={root} className="relative space-y-6 pl-10" aria-label="Inquiry progress">
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-[15px] top-3 w-1 rounded bg-line"
      />
      <span
        data-fill
        aria-hidden="true"
        className="absolute bottom-3 left-[15px] top-3 w-1 origin-top rounded bg-kulhad dark:bg-saffron"
        style={{ transform: 'scaleY(0)' }}
      />
      {PARTY_STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === idx && status === s ? 'step' : undefined}
          className="relative"
        >
          <span
            className={`absolute -left-10 grid h-8 w-8 place-items-center rounded-full border-4 border-bg text-sm font-bold ${reached[i] ? 'bg-kulhad text-white dark:bg-saffron dark:text-iron' : 'bg-line text-muted'}`}
          >
            {reached[i] ? '✓' : i + 1}
          </span>
          <p className={`font-bold ${reached[i] ? '' : 'text-muted'}`}>{PARTY_LABEL[s]}</p>
          <p className="text-sm text-muted">
            {STEP_TEXT[s]}
            {at(s) ? ` · ${formatDateTime(at(s))}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Countdown({ until }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(until) - Date.now())), 1000);
    return () => clearInterval(t);
  }, [until]);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return (
    <strong className="tabular-nums">
      {h}h {String(m).padStart(2, '0')}m
    </strong>
  );
}

export default function PartyInquiryDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const {
    data: i,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: keys.partyInquiry(id),
    queryFn: () => fetchInquiry(id),
    refetchInterval: (q) => (q.state.data && isOpen(q.state.data.status) ? 20_000 : false),
  });
  const [paying, setPaying] = useState(false);

  const act = (fn, message) => ({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.partyInquiry(id) });
      qc.invalidateQueries({ queryKey: keys.partyInquiries });
      toast.success(message);
    },
    onError: (err) => toast.error(toApiError(err).message),
  });
  const accept = useMutation(
    act(() => acceptQuote(id), 'Date reserved! Pay the token to confirm.'),
  );
  const decline = useMutation(act(() => declineQuote(id), 'Quote declined'));
  const cancel = useMutation(act(() => cancelInquiry(id, 'Cancelled by customer'), 'Cancelled'));

  const payToken = async () => {
    setPaying(true);
    try {
      const gateway = await startTokenPayment(id, newIdempotencyKey());
      const res = await openCheckout(gateway, { name: i.name, phone: user?.phone });
      if (res.status === 'paid') {
        setParams({ confirmed: '1' }, { replace: true });
        toast.success('Token received');
      }
      refetch();
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setPaying(false);
    }
  };

  if (isLoading)
    return (
      <div
        className="container-page max-w-2xl space-y-4 py-8"
        role="status"
        aria-label="Loading inquiry"
      >
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (isError && error?.response?.status === 404)
    return (
      <EmptyState
        icon="🔍"
        title="Inquiry not found"
        action={<Button to="/party/inquiries">My parties</Button>}
      />
    );
  if (isError) return <ErrorState onRetry={refetch} />;

  const q = i.quote;
  return (
    <div className="container-page max-w-2xl space-y-6 py-8">
      <Seo title={`Party ${i.inquiryNumber}`} noindex />
      {params.get('confirmed') === '1' && i.status === 'CONFIRMED' && (
        <OrderSuccess
          title="Party confirmed!"
          message={
            <>
              We&apos;ve locked <strong>{longDate(i.eventDate)}</strong> for you.
            </>
          }
          onDone={() => setParams({}, { replace: true })}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm capitalize text-muted">
            {i.eventType} party{i.package?.name ? ` · ${i.package.name}` : ''}
          </p>
          <h1 className="text-3xl sm:text-4xl">{i.inquiryNumber}</h1>
        </div>
        <Badge tone={PARTY_TONE[i.status]}>{PARTY_LABEL[i.status]}</Badge>
      </header>

      {i.status === 'SUBMITTED' && (
        <p className="rounded-2xl bg-surface-2 p-4">
          We&apos;ve got your inquiry and will send a quote soon. You&apos;ll get a notification.
        </p>
      )}

      {i.status === 'QUOTED' && (
        <section className="card space-y-3 p-6" aria-labelledby="quote-h">
          <h2 id="quote-h" className="text-2xl">
            Your quote
          </h2>
          <p className="text-4xl font-bold tabular-nums">{formatPrice(q.amount)}</p>
          <p className="text-muted">
            Token to confirm: <strong>{formatPrice(q.tokenAmount)}</strong> · valid until{' '}
            {longDate(q.validUntil.slice(0, 10))}
          </p>
          {q.notes && <p className="rounded-xl bg-surface-2 p-3">{q.notes}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button loading={accept.isPending} onClick={() => accept.mutate()}>
              Accept &amp; reserve the date
            </Button>
            <Button
              variant="outline"
              loading={decline.isPending}
              onClick={() => window.confirm('Decline this quote?') && decline.mutate()}
            >
              Decline
            </Button>
          </div>
        </section>
      )}

      {i.status === 'ACCEPTED' && (
        <div
          role="alert"
          className="space-y-3 rounded-2xl bg-amber-100 p-5 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100"
        >
          <p className="font-bold">
            {longDate(i.eventDate)} is reserved for you. Pay the token within{' '}
            <Countdown until={i.token.dueAt} /> to confirm.
          </p>
          <Button onClick={payToken} loading={paying}>
            Pay token {formatPrice(i.token.amount)}
          </Button>
        </div>
      )}

      {['CLOSED', 'EXPIRED', 'DECLINED', 'CANCELLED'].includes(i.status) && (
        <p
          role="alert"
          className="rounded-2xl bg-red-100 p-4 font-medium text-red-900 dark:bg-red-900/30 dark:text-red-100"
        >
          {i.status === 'EXPIRED'
            ? 'This inquiry expired.'
            : i.status === 'CLOSED'
              ? "We couldn't host this one."
              : i.status === 'DECLINED'
                ? 'You declined the quote.'
                : 'This party was cancelled.'}{' '}
          {i.closeReason}
          {i.token.status === 'refunded' && ' Your token has been refunded.'}
        </p>
      )}

      <section className="card p-6" aria-labelledby="tl-h">
        <h2 id="tl-h" className="mb-5 text-2xl">
          Progress
        </h2>
        <Timeline status={i.status} history={i.statusHistory} />
      </section>

      <section className="card p-6" aria-label="Event details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Date</dt>
            <dd className="text-lg font-bold">
              {longDate(i.eventDate)}
              {i.startTime ? ` · ${i.startTime}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Guests</dt>
            <dd className="text-lg font-bold">{i.guests}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Contact</dt>
            <dd className="font-bold">
              {i.name} · {i.phone}
            </dd>
          </div>
          {i.token.amount > 0 && (
            <div>
              <dt className="text-sm text-muted">Token</dt>
              <dd className="font-bold">
                {formatPrice(i.token.amount)} · {i.token.status.replace('_', ' ')}
              </dd>
            </div>
          )}
          {i.requirements && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Requests</dt>
              <dd>{i.requirements}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        {(isOpen(i.status) || i.status === 'CONFIRMED') && (
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => window.confirm('Cancel this party inquiry?') && cancel.mutate()}
          >
            Cancel
          </Button>
        )}
        <Button variant="ghost" to="/party/inquiries">
          All inquiries
        </Button>
        <Link
          to="/party"
          className="inline-flex h-11 items-center px-3 font-bold text-brand underline"
        >
          Browse packages
        </Link>
      </div>
    </div>
  );
}
