import { useQuery } from '@tanstack/react-query';
import Reveal from '../../components/animations/Reveal.jsx';
import { api, unwrap, unwrapWithMeta } from '../../lib/axios.js';

/** Home page social proof: average rating and the latest published reviews. Hidden until there are some. */
export default function ReviewsStrip() {
  const summary = useQuery({
    queryKey: ['reviews', 'summary'],
    queryFn: () => api.get('/reviews/summary').then(unwrap),
    staleTime: 5 * 60_000,
  });
  const latest = useQuery({
    queryKey: ['reviews', 'latest'],
    queryFn: () => api.get('/reviews', { params: { limit: 3 } }).then(unwrapWithMeta),
    staleTime: 5 * 60_000,
  });
  if (!summary.data?.count || !latest.data?.data.length) return null;
  return (
    <section className="container-page pt-16" aria-labelledby="rv-h">
      <Reveal as="h2" id="rv-h" className="mb-2 text-3xl sm:text-4xl">
        What customers say
      </Reveal>
      <p className="mb-5 text-muted">
        <span className="text-xl font-bold text-saffron">★ {summary.data.average}</span> from{' '}
        {summary.data.count} review{summary.data.count > 1 ? 's' : ''}
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {latest.data.data.map((r) => (
          <li key={r._id} className="card p-5">
            <p aria-label={`${r.rating} out of 5 stars`} className="text-saffron">
              {'★'.repeat(r.rating)}
              <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
            </p>
            {r.comment && <p className="mt-2">“{r.comment}”</p>}
            <p className="mt-2 text-sm text-muted">— {r.reviewer}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
