import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Reveal from '../../../components/animations/Reveal.jsx';
import StaggerList from '../../../components/animations/StaggerList.jsx';
import { BarsDivider } from '../../../components/common/Brand.jsx';
import Img from '../../../components/common/Img.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { useParallax } from '../../../hooks/useParallax.js';
import { formatPrice } from '../../../lib/format.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import InquiryForm from '../components/InquiryForm.jsx';
import { fetchPackages } from '../api.js';
import { EVENT_TYPES } from '../status.js';

export default function PartyPage() {
  const [type, setType] = useState(null);
  const [picked, setPicked] = useState(null);
  const user = useAuthStore((s) => s.user);
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const {
    data: packages = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: keys.partyPackages(type),
    queryFn: () => fetchPackages(type),
    staleTime: 5 * 60_000,
  });
  const hero = useRef(null);
  const bars = useRef(null);
  useParallax(bars, { speed: 8, trigger: hero });
  const form = useRef(null);

  const choose = (pkg) => {
    setPicked(pkg);
    requestAnimationFrame(() =>
      form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  return (
    <div>
      <Seo
        title="Party booking"
        description="Birthdays, kitty parties, anniversaries and corporate events at Jail Ki Chai. Pick a package and get a quote."
      />
      <section ref={hero} className="relative overflow-hidden bg-chai-900 text-chai-50">
        <div
          ref={bars}
          aria-hidden="true"
          className="bars pointer-events-none absolute -inset-y-10 inset-x-0 text-chai-50/[0.07]"
        />
        <div className="container-page relative py-14 sm:py-20">
          <p className="inline-block rounded-full bg-saffron px-3 py-1 text-sm font-bold text-iron">
            Birthdays · Kitty · Anniversaries · Corporate
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl sm:text-6xl">Throw a party. Make bail easy.</h1>
          <p className="mt-4 max-w-xl text-lg text-chai-200">
            Pick a package, send us your date and guest count, and get a clear quote. Lock the date
            with a small token.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="accent" size="lg" onClick={() => choose(null)}>
              Get a quote
            </Button>
            {authed && (
              <Button to="/party/inquiries" variant="outline" size="lg" className="text-chai-50">
                My inquiries
              </Button>
            )}
          </div>
        </div>
        <BarsDivider className="text-chai-50/10" />
      </section>

      <section className="container-page pt-10" aria-labelledby="pk-h">
        <Reveal as="h2" id="pk-h" className="mb-4 text-3xl sm:text-4xl">
          Our packages
        </Reveal>
        <div role="group" aria-label="Filter by occasion" className="mb-6 flex flex-wrap gap-2">
          <button
            aria-pressed={!type}
            onClick={() => setType(null)}
            className={`rounded-full border-2 px-4 py-1.5 font-bold ${!type ? 'border-kulhad bg-kulhad text-white dark:border-saffron dark:bg-saffron dark:text-iron' : 'border-line'}`}
          >
            All
          </button>
          {EVENT_TYPES.filter(([v]) => v !== 'other').map(([v, l]) => (
            <button
              key={v}
              aria-pressed={type === v}
              onClick={() => setType(v)}
              className={`rounded-full border-2 px-4 py-1.5 font-bold ${type === v ? 'border-kulhad bg-kulhad text-white dark:border-saffron dark:bg-saffron dark:text-iron' : 'border-line'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2" role="status" aria-label="Loading packages">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="We couldn't load the packages." onRetry={refetch} />
        ) : packages.length === 0 ? (
          <EmptyState
            icon="🎈"
            title="No packages here yet"
            message="Tell us what you have in mind and we'll put a custom quote together."
            action={<Button onClick={() => choose(null)}>Request a custom quote</Button>}
          />
        ) : (
          <StaggerList className="grid gap-5 md:grid-cols-2" deps={[type]}>
            {packages.map((p) => (
              <article
                key={p._id}
                data-reveal
                className="card flex flex-col overflow-hidden sm:flex-row"
              >
                {p.image && (
                  <Img
                    src={p.image.url}
                    alt=""
                    width={640}
                    sizes="(min-width:640px) 240px, 100vw"
                    className="h-44 w-full object-cover sm:h-auto sm:w-56"
                  />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-sm font-bold capitalize text-kulhad dark:text-saffron">
                    {p.type}
                  </p>
                  <h3 className="font-sans text-2xl font-bold">{p.name}</h3>
                  {p.tagline && <p className="text-muted">{p.tagline}</p>}
                  <ul className="mt-3 space-y-1 text-sm">
                    {(p.inclusions ?? []).slice(0, 4).map((i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden="true" className="text-veg">
                          ✓
                        </span>
                        {i}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">
                    {p.minGuests}-{p.maxGuests} guests · {p.durationHours} hours
                  </p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <p>
                      <span className="text-sm text-muted">from </span>
                      <span className="text-2xl font-bold tabular-nums">
                        {formatPrice(p.pricePerGuest)}
                      </span>
                      <span className="text-sm text-muted"> / guest</span>
                    </p>
                    <Button size="sm" onClick={() => choose(p)}>
                      Get quote
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </StaggerList>
        )}
      </section>

      <section
        ref={form}
        id="inquire"
        className="container-page max-w-3xl scroll-mt-24 pt-14"
        aria-label="Party inquiry"
      >
        {picked && (
          <p className="mb-3 text-sm">
            Selected package: <strong>{picked.name}</strong>{' '}
            <button onClick={() => setPicked(null)} className="font-bold text-brand underline">
              Clear
            </button>
          </p>
        )}
        <InquiryForm
          key={`${picked?._id ?? 'none'}-${user?._id ?? 'guest'}`}
          pkg={picked}
          user={user}
        />
        <p className="mt-4 text-center text-sm text-muted">
          Already sent one?{' '}
          <Link to="/party/inquiries" className="font-bold text-brand underline">
            See your inquiries
          </Link>
        </p>
      </section>
    </div>
  );
}
