import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../../components/ui/Button.jsx';
import { toApiError } from '../../lib/apiError.js';
import { api, unwrap } from '../../lib/axios.js';
import { toast } from '../ui/uiStore.js';

/** Five-star rating input (radio group, keyboard accessible). */
export function Stars({ value, onChange, label = 'Rating' }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className={`text-4xl leading-none transition-transform hover:scale-110 ${n <= value ? 'text-saffron' : 'text-line'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** "How was it?" box on a delivered order. Shows the submitted review afterwards. */
export default function ReviewBox({ orderId }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const existing = useQuery({
    queryKey: ['review', orderId],
    queryFn: () => api.get(`/reviews/order/${orderId}`).then(unwrap),
  });
  const submit = useMutation({
    mutationFn: () =>
      api.post('/reviews', { orderId, rating, comment: comment.trim() || undefined }).then(unwrap),
    onSuccess: () => {
      toast.success('Thanks for your review!');
      qc.invalidateQueries({ queryKey: ['review', orderId] });
      qc.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  if (existing.isLoading) return null;
  if (existing.data) {
    return (
      <section className="card p-6" aria-label="Your review">
        <h2 className="mb-2 text-2xl">Your review</h2>
        <p aria-label={`${existing.data.rating} out of 5 stars`} className="text-2xl text-saffron">
          {'★'.repeat(existing.data.rating)}
          <span className="text-line">{'★'.repeat(5 - existing.data.rating)}</span>
        </p>
        {existing.data.comment && <p className="mt-1 text-muted">“{existing.data.comment}”</p>}
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-6" aria-labelledby="rev-h">
      <h2 id="rev-h" className="text-2xl">
        How was your order?
      </h2>
      <Stars value={rating} onChange={setRating} />
      <label htmlFor="rev-c" className="sr-only">
        Comment
      </label>
      <textarea
        id="rev-c"
        rows={2}
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us what you loved (optional)"
        className="w-full rounded-xl border-2 border-line bg-surface p-3 focus:border-kulhad focus:outline-none"
      />
      <Button disabled={!rating} loading={submit.isPending} onClick={() => submit.mutate()}>
        Submit review
      </Button>
    </section>
  );
}
