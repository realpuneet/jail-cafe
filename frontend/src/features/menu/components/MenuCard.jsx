import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, VegMark } from '../../../components/common/Badges.jsx';
import Img from '../../../components/common/Img.jsx';
import Button from '../../../components/ui/Button.jsx';
import { formatPrice } from '../../../lib/format.js';
import { useCart } from '../../cart/useCart.js';
import ItemOptionsModal from './ItemOptionsModal.jsx';

/** One menu item. Items with options open a chooser, simple items add instantly. */
function MenuCard({ item }) {
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  const hasOptions = Boolean(item.variants?.length || item.addOns?.length);
  const soldOut = item.isAvailable === false;
  const from = item.variants?.length ? Math.min(...item.variants.map((v) => v.price)) : item.price;

  return (
    <article data-reveal className="card flex h-full flex-row overflow-hidden sm:flex-col">
      <Link
        to={`/menu/${item.slug}`}
        className="block w-28 shrink-0 overflow-hidden bg-surface-2 sm:w-auto"
        aria-label={`View ${item.name}`}
      >
        <Img
          src={item.image?.url}
          alt={item.name}
          width={640}
          className={`h-full w-full object-cover sm:aspect-[4/3] sm:h-auto transition-transform duration-500 hover:scale-105 ${soldOut ? 'grayscale' : ''}`}
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <VegMark isVeg={item.isVeg} className="mt-1.5 shrink-0" />
          <h3 className="font-sans text-lg font-bold leading-snug">
            <Link to={`/menu/${item.slug}`} className="hover:underline">
              {item.name}
            </Link>
          </h3>
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <div>
            <p className="text-lg font-bold tabular-nums">
              {item.variants?.length > 1 && (
                <span className="mr-1 text-sm font-normal text-muted">from</span>
              )}
              {formatPrice(from)}
            </p>
            {item.mrp > item.price && !item.variants?.length && (
              <p className="text-sm text-muted line-through">{formatPrice(item.mrp)}</p>
            )}
          </div>
          {soldOut ? (
            <Badge tone="danger">Sold out</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (hasOptions ? setOpen(true) : add(item))}
              aria-label={`${hasOptions ? 'Customise' : 'Add'} ${item.name}`}
            >
              {hasOptions ? 'Customise' : 'Add +'}
            </Button>
          )}
        </div>
      </div>
      {hasOptions && open && (
        <ItemOptionsModal
          item={item}
          open={open}
          onClose={() => setOpen(false)}
          onAdd={(choices) => add(item, choices)}
        />
      )}
    </article>
  );
}

export default memo(MenuCard);
