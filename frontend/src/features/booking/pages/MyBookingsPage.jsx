import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { keys } from '../../../lib/queryKeys.js';
import { fetchBookings } from '../api.js';
import { longDate, time12 } from '../dates.js';
import { BOOKING_LABEL, BOOKING_TONE } from '../status.js';

export default function MyBookingsPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.bookings,
      queryFn: ({ pageParam }) => fetchBookings({ cursor: pageParam }),
      initialPageParam: undefined,
      getNextPageParam: (l) => l.meta?.nextCursor ?? undefined,
    });
  const items = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="container-page max-w-2xl py-8">
      <Seo title="My bookings" noindex />
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-4xl">My bookings</h1>
        <Button to="/book-table" size="sm">
          Book a table
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading bookings">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🪑"
          title="No bookings yet"
          message="Reserve a table for your next chai session."
          action={<Button to="/book-table">Book a table</Button>}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((b) => (
              <li key={b._id}>
                <Link
                  to={`/bookings/${b._id}`}
                  className="card flex items-center justify-between gap-3 p-4 hover:shadow-lg"
                >
                  <div>
                    <p className="font-bold">
                      {longDate(b.date)} · {time12(b.slot.startTime)}
                    </p>
                    <p className="text-sm text-muted">
                      {b.bookingNumber} · {b.guests} guest{b.guests > 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
