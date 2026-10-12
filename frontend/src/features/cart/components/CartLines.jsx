import { Link } from 'react-router-dom';
import { Badge, VegMark } from '../../../components/common/Badges.jsx';
import Img from '../../../components/common/Img.jsx';
import QuantityStepper from '../../../components/ui/QuantityStepper.jsx';
import { formatPrice } from '../../../lib/format.js';

const ISSUE_TEXT = {
  removed: 'No longer available',
  out_of_stock: 'Sold out right now',
  invalid_option: 'Options changed',
};

/** The list of cart lines with steppers; shared by the drawer and the cart page. */
export default function CartLines({ items, onQuantity, onRemove, compact = false }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((l) => (
        <li key={l.lineId} className="flex gap-3 py-4">
          <div
            className={`${compact ? 'h-16 w-16' : 'h-20 w-20'} shrink-0 overflow-hidden rounded-xl bg-surface-2`}
          >
            <Img
              src={l.image}
              alt=""
              width={160}
              sizes="80px"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  {l.isVeg !== undefined && <VegMark isVeg={l.isVeg} />}
                  <span className="truncate">{l.name}</span>
                </p>
                {(l.variantName || l.addOns?.length > 0) && (
                  <p className="truncate text-sm text-muted">
                    {[l.variantName, ...(l.addOns ?? []).map((a) => `+ ${a.name}`)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {l.note && <p className="truncate text-sm italic text-muted">“{l.note}”</p>}
              </div>
              <p className="shrink-0 font-bold tabular-nums">
                {formatPrice(l.unitPrice * l.quantity)}
              </p>
            </div>
            {l.issue ? (
              <div className="mt-2 flex items-center gap-3">
                <Badge tone="danger">{ISSUE_TEXT[l.issue] ?? 'Unavailable'}</Badge>
                <button
                  onClick={() => onRemove(l.lineId)}
                  className="text-sm font-bold text-brand underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between">
                <QuantityStepper
                  value={l.quantity}
                  label={l.name}
                  size="sm"
                  onChange={(q) => onQuantity(l.lineId, q)}
                />
                <button
                  onClick={() => onRemove(l.lineId)}
                  aria-label={`Remove ${l.name}`}
                  className="text-sm text-muted underline hover:text-fg"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartEmpty({ onBrowse }) {
  return (
    <div className="py-10 text-center">
      <div className="text-6xl" aria-hidden="true">
        🫗
      </div>
      <p className="mt-3 text-xl font-bold">Your cart is empty</p>
      <p className="mt-1 text-muted">Add a cup of chai, it won&apos;t go to jail.</p>
      <Link
        to="/menu"
        onClick={onBrowse}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-chai-700 px-6 font-bold text-white hover:bg-chai-800 dark:bg-saffron dark:text-iron"
      >
        Browse the menu
      </Link>
    </div>
  );
}
