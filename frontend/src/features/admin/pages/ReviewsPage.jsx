import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api } from '../../../lib/axios.js';
import { formatDateTime } from '../../../lib/format.js';
import { toast } from '../../ui/uiStore.js';
import { LoadMore, Panel } from '../components/Fields.jsx';
import { flatten, useAdminList } from '../hooks.js';

export default function ReviewsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const list = useAdminList(['reviews'], '/reviews/manage', status ? { status } : {});
  const set = useMutation({
    mutationFn: ({ id, status: s }) => api.patch(`/reviews/${id}/status`, { status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reviews'] }),
    onError: (e) => toast.error(toApiError(e).message),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-4xl">Reviews</h1>
      <div role="group" aria-label="Filter" className="flex gap-2">
        {[
          ['', 'All'],
          ['published', 'Published'],
          ['hidden', 'Hidden'],
        ].map(([v, l]) => (
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
          {flatten(list.data).map((r) => (
            <li key={r._id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  <span aria-label={`${r.rating} out of 5 stars`} className="text-saffron">
                    {'★'.repeat(r.rating)}
                    <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
                  </span>{' '}
                  {r.reviewer} {r.status === 'hidden' && <Badge tone="danger">Hidden</Badge>}
                </p>
                {r.comment && <p className="mt-1">{r.comment}</p>}
                <p className="text-sm text-muted">
                  {(r.items ?? []).join(', ')} · {formatDateTime(r.createdAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  set.mutate({ id: r._id, status: r.status === 'hidden' ? 'published' : 'hidden' })
                }
              >
                {r.status === 'hidden' ? 'Publish' : 'Hide'}
              </Button>
            </li>
          ))}
          {!list.isLoading && flatten(list.data).length === 0 && (
            <li className="py-8 text-center text-muted">No reviews yet.</li>
          )}
        </ul>
        <LoadMore query={list} />
      </Panel>
    </div>
  );
}
