import { useRef } from 'react';
import { Link } from 'react-router-dom';
import ChaiSteam from '../components/animations/ChaiSteam.jsx';
import Magnetic from '../components/animations/Magnetic.jsx';
import Reveal from '../components/animations/Reveal.jsx';
import SplitText from '../components/animations/SplitText.jsx';
import StaggerList from '../components/animations/StaggerList.jsx';
import { BarsDivider } from '../components/common/Brand.jsx';
import Img from '../components/common/Img.jsx';
import Seo from '../components/common/Seo.jsx';
import Button from '../components/ui/Button.jsx';
import { MenuCardSkeleton } from '../components/ui/Skeleton.jsx';
import MenuCard from '../features/menu/components/MenuCard.jsx';
import { useBanners, useCategories, useMenu } from '../features/menu/hooks.js';
import { useParallax } from '../hooks/useParallax.js';

const STEPS = [
  ['🍽️', 'Pick your poison', 'Chai, snacks, burgers: build your cart in seconds.'],
  ['🔓', 'Pay your bail', 'UPI, cards or cash. Totals are always confirmed by us.'],
  ['🛵', 'Break out', 'Track your order live, from kitchen to doorstep.'],
];

export default function HomePage() {
  const { data: categories = [] } = useCategories();
  const { data: menu, isLoading } = useMenu();
  const { data: banners = [] } = useBanners('home_hero');
  const cell = useRef(null);
  const bars = useRef(null);
  useParallax(bars, { speed: 6, trigger: cell });
  const popular = (menu ?? []).filter((i) => i.isAvailable !== false).slice(0, 6);

  return (
    <div>
      <Seo title="Chai, snacks & fast food" />

      <section ref={cell} className="relative overflow-hidden bg-chai-900 text-chai-50">
        <div
          ref={bars}
          aria-hidden="true"
          className="bars pointer-events-none absolute -inset-y-10 inset-x-0 text-chai-50/[0.07]"
        />
        <div className="container-page relative grid items-center gap-8 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <p className="inline-block rounded-full bg-saffron px-3 py-1 text-sm font-bold text-iron">
              Now serving · Delivery · Pickup
            </p>
            <h1 className="mt-5 text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
              <SplitText text="Break out for a cup of chai." />
            </h1>
            <p className="mt-5 max-w-lg text-lg text-chai-200">
              Kulhad chai, hot snacks and fast food, served on good behaviour. Order now and get it
              delivered, or pick it up fresh.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Magnetic>
                <Button to="/menu" variant="accent" size="lg">
                  Order now
                </Button>
              </Magnetic>
              <Button to="/menu?veg=1" variant="outline" size="lg" className="text-chai-50">
                Veg picks
              </Button>
            </div>
          </div>
          <div className="relative mx-auto w-56 sm:w-72 md:w-80">
            <div className="rounded-[2rem] border-4 border-chai-50/20 bg-chai-800/60 p-6 pb-4 shadow-2xl">
              <ChaiSteam className="mx-auto w-full text-chai-100" />
            </div>
            <div
              aria-hidden="true"
              className="bars pointer-events-none absolute inset-0 rounded-[2rem] text-iron/70 [mask-image:linear-gradient(90deg,#000_0,#000_100%)]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, currentColor 0 7px, transparent 7px 38px)',
              }}
            />
          </div>
        </div>
        <BarsDivider className="text-chai-50/10" />
      </section>

      {banners.length > 0 && (
        <section aria-label="Offers" className="container-page pt-8">
          <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">
            {banners.map((b) => (
              <li
                key={b._id}
                className="w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl sm:w-[48%]"
              >
                {b.linkUrl?.startsWith('/') ? (
                  <Link to={b.linkUrl}>
                    <Img
                      src={b.image.url}
                      alt={b.title}
                      width={960}
                      sizes="(min-width:640px) 48vw, 88vw"
                      className="aspect-[16/7] w-full object-cover"
                    />
                  </Link>
                ) : (
                  <Img
                    src={b.image.url}
                    alt={b.title}
                    width={960}
                    sizes="(min-width:640px) 48vw, 88vw"
                    className="aspect-[16/7] w-full object-cover"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {categories.length > 0 && (
        <section className="container-page pt-12" aria-labelledby="cats-h">
          <Reveal as="h2" id="cats-h" className="mb-5 text-3xl sm:text-4xl">
            What are you craving?
          </Reveal>
          <StaggerList className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c._id}
                data-reveal
                to={`/menu?category=${c.slug}`}
                className="card group overflow-hidden transition-transform hover:-translate-y-1"
              >
                <Img
                  src={c.image?.url}
                  alt=""
                  width={480}
                  sizes="(min-width:1024px) 25vw, 45vw"
                  className="aspect-[4/3] w-full object-cover"
                />
                <p className="p-3 font-bold group-hover:text-brand">{c.name} →</p>
              </Link>
            ))}
          </StaggerList>
        </section>
      )}

      <section className="container-page pt-14" aria-labelledby="pop-h">
        <div className="mb-5 flex items-end justify-between">
          <Reveal as="h2" id="pop-h" className="text-3xl sm:text-4xl">
            Popular right now
          </Reveal>
          <Link to="/menu" className="font-bold text-brand underline">
            See all
          </Link>
        </div>
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <MenuCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <StaggerList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((item) => (
              <MenuCard key={item._id} item={item} />
            ))}
          </StaggerList>
        )}
      </section>

      <section className="container-page pt-14" aria-labelledby="book-h">
        <Reveal className="relative overflow-hidden rounded-3xl bg-chai-900 p-8 text-chai-50 sm:p-12">
          <div
            aria-hidden="true"
            className="bars pointer-events-none absolute inset-0 text-chai-50/[0.06]"
          />
          <div className="relative max-w-xl">
            <h2 id="book-h" className="text-3xl sm:text-4xl">
              Reserve your cell. Err, table.
            </h2>
            <p className="mt-3 text-chai-200">
              Dinner with friends? Pick a date and time, see live availability and get an instant
              confirmation.
            </p>
            <div className="mt-6">
              <div className="flex flex-wrap gap-3">
                <Button to="/book-table" variant="accent" size="lg">
                  Book a table
                </Button>
                <Button to="/party" variant="outline" size="lg" className="text-chai-50">
                  Plan a party
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="container-page pt-16" aria-labelledby="how-h">
        <Reveal as="h2" id="how-h" className="mb-6 text-3xl sm:text-4xl">
          How it works
        </Reveal>
        <StaggerList as="ol" className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title} data-reveal className="card p-6">
              <span className="text-4xl" aria-hidden="true">
                {icon}
              </span>
              <p className="mt-3 text-sm font-bold text-muted">Step {i + 1}</p>
              <h3 className="font-sans text-xl font-bold">{title}</h3>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </StaggerList>
      </section>
    </div>
  );
}
