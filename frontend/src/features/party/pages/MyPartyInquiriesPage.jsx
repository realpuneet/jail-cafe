import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/common/Badges.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { keys } from '../../../lib/queryKeys.js';
import { longDate } from '../../booking/dates.js';
import { fetchInquiries } from '../api.js';
import { PARTY_LABEL, PARTY_TONE } from '../status.js';

export default function MyPartyInquiriesPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.partyInquiries,
      queryFn: ({ pageParam }) => fetchInquiries({ cursor: pageParam }),
      initialPageParam: undefined,
      getNextPageParam: (l) => l.meta?.nextCursor ?? undefined,
    });
  const items = data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="container-page max-w-2xl py-8">
      <Seo title="My party inquiries" noindex />
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-4xl">My parties</h1>
        <Button to="/party" size="sm">
          New inquiry
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading inquiries">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="No inquiries yet"
          message="Plan a birthday, kitty party or office lunch."
          action={<Button to="/party">Explore packages</Button>}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i._id}>
                <Link
                  to={`/party/inquiries/${i._id}`}
                  className="card flex items-center justify-between gap-3 p-4 hover:shadow-lg"
                >
                  <div>
                    <p className="font-bold capitalize">
                      {i.eventType} · {longDate(i.eventDate)}
                    </p>
                    <p className="text-sm text-muted">
                      {i.inquiryNumber} · {i.guests} guests
                      {i.package?.name ? ` · ${i.package.name}` : ''}
                    </p>
                  </div>
                  <Badge tone={PARTY_TONE[i.status]}>{PARTY_LABEL[i.status]}</Badge>
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
