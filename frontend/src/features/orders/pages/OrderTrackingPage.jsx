import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatDateTime, formatPrice } from '../../../lib/format.js';
import { distanceKm, mapsLink } from '../../../lib/geo.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { toast } from '../../ui/uiStore.js';
import { cancelOrder } from '../api.js';
import ReviewBox from '../../reviews/ReviewBox.jsx';
import OrderSuccess from '../components/OrderSuccess.jsx';
import OrderTimeline from '../components/OrderTimeline.jsx';
import { useLiveOrder } from '../hooks.js';
import { payForOrder } from '../payment.js';
import { isClosed, labelFor, needsPayment, STATUS_TONE } from '../status.js';

export default function OrderTrackingPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: order, isLoading, isError, error, refetch, location, live } = useLiveOrder(id);
  const [paying, setPaying] = useState(false);

  const cancel = useMutation({
    mutationFn: () => cancelOrder(id, 'Cancelled by customer'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.order(id) });
      qc.invalidateQueries({ queryKey: keys.orders });
      toast.success('Order cancelled');
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const retryPayment = async () => {
    setPaying(true);
    try {
      const res = await payForOrder(order, { name: user?.name, phone: user?.phone });
      if (res.status === 'paid') toast.success('Payment received');
      refetch();
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className="container-page max-w-3xl space-y-4 py-8"
        role="status"
        aria-label="Loading order"
      >
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError && error?.response?.status === 404) {
    return (
      <EmptyState
        title="Order not found"
        icon="🔍"
        action={<Button to="/orders">My orders</Button>}
      />
    );
  }
  if (isError) return <ErrorState message="We couldn't load this order." onRetry={refetch} />;

  const closed = isClosed(order.status);
  const rider =
    location && order.address?.location?.coordinates
      ? distanceKm(
          { lat: location.lat, lng: location.lng },
          {
            lat: order.address.location.coordinates[1],
            lng: order.address.location.coordinates[0],
          },
        )
      : null;

  return (
    <div className="container-page max-w-3xl space-y-6 py-8">
      <Seo title={`Order ${order.orderNumber}`} noindex />
      {params.get('placed') === '1' && (
        <OrderSuccess
          orderNumber={order.orderNumber}
          onDone={() => setParams({}, { replace: true })}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatDateTime(order.createdAt)}</p>
          <h1 className="text-3xl sm:text-4xl">{order.orderNumber}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[order.status]}>{labelFor(order.status, order.type)}</Badge>
          {!closed && (
            <span className="text-xs text-muted">
              {live ? '● Live updates on' : 'Updating every few seconds'}
            </span>
          )}
        </div>
      </header>

      {needsPayment(order) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-100 p-4 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100"
        >
          <p className="font-bold">Payment pending. Your order starts once you pay.</p>
          <Button onClick={retryPayment} loading={paying}>
            Pay {formatPrice(order.pricing.total)}
          </Button>
        </div>
      )}

      {['CANCELLED', 'REJECTED'].includes(order.status) ? (
        <div
          role="alert"
          className="rounded-2xl bg-red-100 p-5 text-red-900 dark:bg-red-900/30 dark:text-red-100"
        >
          <p className="text-xl font-bold">
            {order.status === 'CANCELLED' ? 'Order cancelled' : 'Order rejected'}
          </p>
          {order.cancelReason && <p className="mt-1">{order.cancelReason}</p>}
          {order.payment.method === 'online' &&
            ['paid', 'refunded', 'partially_refunded'].includes(order.payment.status) && (
              <p className="mt-2 text-sm">
                {order.payment.status === 'paid'
                  ? 'Your refund is being processed.'
                  : `Refunded: ${formatPrice(order.payment.refundedAmount)}`}
              </p>
            )}
        </div>
      ) : (
        <section className="card p-6" aria-labelledby="progress-h">
          <h2 id="progress-h" className="mb-5 text-2xl">
            Order progress
          </h2>
          <OrderTimeline status={order.status} type={order.type} history={order.statusHistory} />
          {order.status === 'OUT_FOR_DELIVERY' && (
            <div className="mt-6 rounded-xl bg-surface-2 p-4">
              <p className="font-bold">🛵 Your rider is on the way</p>
              {location ? (
                <p className="text-sm text-muted">
                  Last seen{' '}
                  {new Date(location.at).toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {rider !== null && ` · about ${rider.toFixed(1)} km away`} ·{' '}
                  <a
                    className="font-bold text-brand underline"
                    href={mapsLink(location)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Maps
                  </a>
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Live location will appear here once the rider starts sharing it.
                </p>
              )}
            </div>
          )}
          {order.delivery?.estimatedMinutes && !closed && (
            <p className="mt-4 text-sm text-muted">
              Estimated delivery time: ~{order.delivery.estimatedMinutes} min from acceptance.
            </p>
          )}
        </section>
      )}

      {order.status === 'DELIVERED' && <ReviewBox orderId={order._id} />}

      <section className="card p-6" aria-labelledby="items-h">
        <h2 id="items-h" className="mb-3 text-2xl">
          Items
        </h2>
        <ul className="divide-y divide-line">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-4 py-3">
              <div>
                <p className="font-bold">
                  {i.quantity} × {i.name}
                </p>
                <p className="text-sm text-muted">
                  {[i.variantName, ...(i.addOns ?? []).map((a) => `+ ${a.name}`)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <p className="tabular-nums">{formatPrice(i.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPrice(order.pricing.subtotal)}</dd>
          </div>
          {order.pricing.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">
                Discount {order.coupon?.code && `(${order.coupon.code})`}
              </dt>
              <dd>-{formatPrice(order.pricing.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>
              {order.pricing.deliveryCharge ? formatPrice(order.pricing.deliveryCharge) : 'Free'}
            </dd>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <dt>Total</dt>
            <dd>{formatPrice(order.pricing.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Payment</dt>
            <dd className="capitalize">
              {order.payment.method === 'cod' ? 'Cash' : 'Online'} ·{' '}
              {order.payment.status.replace('_', ' ')}
            </dd>
          </div>
        </dl>
      </section>

      {order.address && (
        <section className="card p-6">
          <h2 className="mb-2 text-2xl">Delivering to</h2>
          <p className="font-bold">{order.address.name}</p>
          <p className="text-muted">
            {[
              order.address.line1,
              order.address.line2,
              order.address.landmark,
              order.address.city,
              order.address.state,
              order.address.pincode,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        {order.status === 'PLACED' && (
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => window.confirm('Cancel this order?') && cancel.mutate()}
          >
            Cancel order
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/orders')}>
          All orders
        </Button>
        <Link
          to="/menu"
          className="inline-flex h-11 items-center px-3 font-bold text-brand underline"
        >
          Order again
        </Link>
      </div>
    </div>
  );
}
