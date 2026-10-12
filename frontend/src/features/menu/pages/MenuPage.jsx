import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Seo from '../../../components/common/Seo.jsx';
import { BarsDivider } from '../../../components/common/Brand.jsx';
import StaggerList from '../../../components/animations/StaggerList.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import { MenuCardSkeleton } from '../../../components/ui/Skeleton.jsx';
import { useDebounce } from '../../../hooks/useDebounce.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import MenuCard from '../components/MenuCard.jsx';
import { useGroupedMenu } from '../hooks.js';

/** Menu with debounced instant search, veg toggle and animated category tabs. */
export default function MenuPage() {
  const [params, setParams] = useSearchParams();
  const categorySlug = params.get('category');
  const veg = params.get('veg') === '1';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounce(search, 250);

  const base = useGroupedMenu({ q, veg, categoryId: null });
  const activeCategory = base.categories.find((c) => c.slug === categorySlug);
  const { groups, categories, isLoading, isError, refetch } = useGroupedMenu({
    q,
    veg,
    categoryId: activeCategory?._id ?? null,
  });

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  useEffect(() => update({ q: q || null }), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = useRef(null);
  const underline = useRef(null);
  useGSAP(
    () => {
      const active = tabs.current?.querySelector('[aria-selected="true"]');
      if (!active || !underline.current) return;
      const props = { x: active.offsetLeft, width: active.offsetWidth };
      if (prefersReducedMotion()) gsap.set(underline.current, props);
      else gsap.to(underline.current, { ...props, duration: 0.35, ease: 'power3.out' });
    },
    { scope: tabs, dependencies: [categorySlug, categories.length], revertOnUpdate: false },
  );

  return (
    <div>
      <Seo
        title="Menu"
        description="Chai, snacks, burgers and more. Filter veg, search and order for delivery or pickup."
      />
      <div className="bg-surface-2">
        <div className="container-page pb-6 pt-8">
          <h1 className="text-4xl sm:text-5xl">The Menu</h1>
          <p className="mt-2 text-muted">Everything&apos;s fresh, hot and out on good behaviour.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="menu-search" className="sr-only">
                Search the menu
              </label>
              <input
                id="menu-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chai, burger, fries…"
                className="h-12 w-full rounded-full border-2 border-line bg-surface px-5 focus:border-kulhad focus:outline-none"
              />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={veg}
              onClick={() => update({ veg: veg ? null : '1' })}
              className={`inline-flex h-12 items-center gap-2 rounded-full border-2 px-5 font-bold ${veg ? 'border-veg bg-veg text-white' : 'border-line bg-surface'}`}
            >
              <span className="inline-grid h-4 w-4 place-items-center rounded-[3px] border-2 border-current">
                <span className="h-2 w-2 rounded-full bg-current" />
              </span>
              Veg only
            </button>
          </div>
        </div>
        <BarsDivider />
      </div>

      <div className="sticky top-[var(--header-h,64px)] z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="container-page">
          <div
            ref={tabs}
            role="tablist"
            aria-label="Menu categories"
            className="relative flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]"
          >
            <button
              role="tab"
              aria-selected={!categorySlug}
              onClick={() => update({ category: null })}
              className="shrink-0 rounded-full px-4 py-2 font-bold aria-selected:text-brand"
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c._id}
                role="tab"
                aria-selected={categorySlug === c.slug}
                onClick={() => update({ category: c.slug })}
                className="shrink-0 rounded-full px-4 py-2 font-bold text-muted aria-selected:text-brand"
              >
                {c.name}
              </button>
            ))}
            <span
              ref={underline}
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[3px] rounded bg-kulhad dark:bg-saffron"
              style={{ width: 0 }}
            />
          </div>
        </div>
      </div>

      <div className="container-page space-y-10 py-8">
        {isLoading ? (
          <div
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading menu"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <MenuCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="We couldn't load the menu." onRetry={refetch} />
        ) : groups.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            message={q ? `No dishes found for “${q}”.` : 'No items in this category yet.'}
            action={null}
          />
        ) : (
          groups.map(({ category, items }) => (
            <section
              key={category._id}
              aria-labelledby={`cat-${category.slug}`}
              className="below-fold"
            >
              <h2 id={`cat-${category.slug}`} className="mb-4 text-3xl">
                {category.name}
              </h2>
              {category.description && (
                <p className="-mt-2 mb-4 text-muted">{category.description}</p>
              )}
              <StaggerList
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                deps={[categorySlug, veg, q]}
              >
                {items.map((item) => (
                  <MenuCard key={item._id} item={item} />
                ))}
              </StaggerList>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
