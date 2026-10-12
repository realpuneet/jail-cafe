import { useEffect, useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { formatDateTime, formatPrice } from '../../../lib/format.js';
import { useOrders } from '../hooks.js';
import { labelFor, STATUS_TONE } from '../status.js';

function OrderRow({ order }) {
  return (
    <Link to={`/orders/${order._id}`} className="card block p-4 transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{order.orderNumber}</p>
          <p className="text-sm text-muted">{formatDateTime(order.createdAt)}</p>
        </div>
        <Badge tone={STATUS_TONE[order.status]}>{labelFor(order.status, order.type)}</Badge>
      </div>
      <p className="mt-2 truncate text-sm text-muted">
        {order.items
          .slice(0, 3)
          .map((i) => `${i.quantity}× ${i.name}`)
          .join(', ')}
        {order.items.length > 3 && ` +${order.items.length - 3} more`}
      </p>
      <p className="mt-2 text-lg font-bold tabular-nums">{formatPrice(order.pricing.total)}</p>
    </Link>
  );
}

/** Order history: cursor-paginated and windowed, so thousands of orders stay smooth. */
export default function MyOrdersPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useOrders();
  const orders = data?.pages.flatMap((p) => p.data) ?? [];
  const listRef = useRef(null);

  const virtualizer = useWindowVirtualizer({
    count: orders.length,
    estimateSize: () => 132,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    gap: 12,
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = items.at(-1);
    if (last && last.index >= orders.length - 4 && hasNextPage && !isFetchingNextPage)
      fetchNextPage();
  }, [items, orders.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="container-page max-w-2xl py-8">
      <Seo title="My orders" noindex />
      <h1 className="mb-6 text-4xl">My orders</h1>
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading orders">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="We couldn't load your orders." onRetry={refetch} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          message="Your first cup is waiting."
          action={<Button to="/menu">Order now</Button>}
        />
      ) : (
        <div ref={listRef}>
          <ul
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            aria-label="Orders"
          >
            {items.map((v) => (
              <li
                key={orders[v.index]._id}
                ref={virtualizer.measureElement}
                data-index={v.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <OrderRow order={orders[v.index]} />
              </li>
            ))}
          </ul>
          {isFetchingNextPage && <Skeleton className="mt-3 h-24 w-full" />}
        </div>
      )}
    </div>
  );
}
