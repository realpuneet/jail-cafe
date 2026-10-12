import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, VegMark } from '../../../components/common/Badges.jsx';
import Img from '../../../components/common/Img.jsx';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import QuantityStepper from '../../../components/ui/QuantityStepper.jsx';
import { EmptyState, ErrorState } from '../../../components/ui/States.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { formatPrice } from '../../../lib/format.js';
import { unitPriceFor } from '../../cart/pricing.js';
import { useCart } from '../../cart/useCart.js';
import { useMenuItem } from '../hooks.js';

function ItemBody({ item }) {
  const { add } = useCart();
  const firstVariant = item.variants?.find((v) => v.isAvailable !== false)?._id;
  const [variantId, setVariantId] = useState(firstVariant);
  const [addOnIds, setAddOnIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const unit = unitPriceFor(item, variantId, addOnIds);
  const soldOut = item.isAvailable === false;
  const toggle = (id) =>
    setAddOnIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Seo
        title={item.name}
        description={item.description ?? `Order ${item.name} from Jail Ki Chai.`}
        image={item.image?.url}
      />
      <div className="card overflow-hidden">
        <Img
          src={item.image?.url}
          alt={item.name}
          width={960}
          eager
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-[4/3] w-full object-cover"
        />
      </div>
      <div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <VegMark isVeg={item.isVeg} /> {item.isVeg ? 'Vegetarian' : 'Non-vegetarian'} · ready in ~
          {item.prepTimeMinutes ?? 15} min
        </p>
        <h1 className="mt-2 text-4xl">{item.name}</h1>
        {item.description && <p className="mt-3 text-muted">{item.description}</p>}

        {item.variants?.length > 0 && (
          <fieldset className="mt-6">
            <legend className="mb-2 font-bold">Size</legend>
            <div className="flex flex-wrap gap-2">
              {item.variants.map((v) => (
                <button
                  key={v._id}
                  type="button"
                  disabled={v.isAvailable === false}
                  aria-pressed={variantId === v._id}
                  onClick={() => setVariantId(v._id)}
                  className={`rounded-full border-2 px-4 py-2 font-bold ${variantId === v._id ? 'border-kulhad bg-kulhad text-white' : 'border-line'} disabled:opacity-40`}
                >
                  {v.name} · {formatPrice(v.price)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {item.addOns?.length > 0 && (
          <fieldset className="mt-6">
            <legend className="mb-2 font-bold">Add-ons</legend>
            <div className="flex flex-wrap gap-2">
              {item.addOns.map((a) => (
                <button
                  key={a._id}
                  type="button"
                  disabled={a.isAvailable === false}
                  aria-pressed={addOnIds.includes(a._id)}
                  onClick={() => toggle(a._id)}
                  className={`rounded-full border-2 px-4 py-2 ${addOnIds.includes(a._id) ? 'border-kulhad bg-surface-2 font-bold' : 'border-line'} disabled:opacity-40`}
                >
                  {a.name} +{formatPrice(a.price)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-8 flex items-center gap-4">
          {soldOut ? (
            <Badge tone="danger">Sold out right now</Badge>
          ) : (
            <>
              <QuantityStepper value={quantity} min={1} label={item.name} onChange={setQuantity} />
              <Button
                size="lg"
                className="flex-1"
                onClick={() => add(item, { variantId, addOnIds, quantity })}
              >
                Add to cart · {formatPrice(unit * quantity)}
              </Button>
            </>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">
          Prices include GST. Final amount is confirmed at checkout.
        </p>
      </div>
    </div>
  );
}

export default function ItemDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, isError, error, refetch } = useMenuItem(slug);
  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm">
        <Link to="/menu" className="font-bold text-brand underline">
          ← Back to menu
        </Link>
      </nav>
      {isLoading ? (
        <div className="grid gap-8 md:grid-cols-2" role="status" aria-label="Loading item">
          <Skeleton className="aspect-[4/3] w-full" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : isError && error?.response?.status === 404 ? (
        <EmptyState
          title="Dish not found"
          message="It may have left the building."
          icon="🔍"
          action={<Button to="/menu">See the menu</Button>}
        />
      ) : isError ? (
        <ErrorState message="We couldn't load this dish." onRetry={refetch} />
      ) : (
        <ItemBody key={data._id} item={data} />
      )}
    </div>
  );
}
