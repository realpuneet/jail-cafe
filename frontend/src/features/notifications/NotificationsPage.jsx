import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Seo from '../../components/common/Seo.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { api, unwrap, unwrapWithMeta } from '../../lib/axios.js';
import { formatDateTime } from '../../lib/format.js';
import { keys } from '../../lib/queryKeys.js';

const fetchPage = ({ pageParam }) =>
  api.get('/notifications', { params: { cursor: pageParam, limit: 20 } }).then(unwrapWithMeta);

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.notifications,
      queryFn: fetchPage,
      initialPageParam: undefined,
      getNextPageParam: (l) => l.meta?.nextCursor ?? undefined,
    });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read', {}).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const items = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="container-page max-w-2xl py-8">
      <Seo title="Notifications" noindex />
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-4xl">Notifications</h1>
        {items.some((n) => !n.readAt) && (
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title="All quiet"
          message="Order and payment updates will show up here."
          icon="🔔"
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((n) => {
              const body = (
                <div className={`card p-4 ${n.readAt ? '' : 'border-l-4 border-l-kulhad'}`}>
                  <p className="font-bold">{n.title}</p>
                  <p className="text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
              );
              return (
                <li key={n._id}>
                  {n.data?.orderId ? <Link to={`/orders/${n.data.orderId}`}>{body}</Link> : body}
                </li>
              );
            })}
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
