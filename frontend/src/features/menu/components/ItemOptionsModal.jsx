import { useMemo, useState } from 'react';
import { VegMark } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import QuantityStepper from '../../../components/ui/QuantityStepper.jsx';
import { formatPrice } from '../../../lib/format.js';
import { unitPriceFor } from '../../cart/pricing.js';

/** Choose a variant, add-ons, quantity and a note, then add to cart. */
export default function ItemOptionsModal({ item, open, onClose, onAdd }) {
  const available = (item.variants ?? []).filter((v) => v.isAvailable !== false);
  const [variantId, setVariantId] = useState(available[0]?._id);
  const [addOnIds, setAddOnIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const unit = useMemo(() => unitPriceFor(item, variantId, addOnIds), [item, variantId, addOnIds]);
  const toggle = (id) =>
    setAddOnIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async () => {
    setBusy(true);
    await onAdd({ variantId, addOnIds, quantity, note: note.trim() || undefined });
    setBusy(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={item.name}>
      <div className="space-y-5">
        {item.description && <p className="text-muted">{item.description}</p>}

        {item.variants?.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-bold">Choose size</legend>
            <div className="space-y-2">
              {item.variants.map((v) => (
                <label
                  key={v._id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 px-4 py-3 ${variantId === v._id ? 'border-kulhad bg-surface-2' : 'border-line'} ${v.isAvailable === false ? 'opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      className="accent-[var(--color-kulhad)]"
                      checked={variantId === v._id}
                      disabled={v.isAvailable === false}
                      onChange={() => setVariantId(v._id)}
                    />
                    {v.name}
                    {v.isAvailable === false && <span className="text-xs">(sold out)</span>}
                  </span>
                  <span className="font-bold tabular-nums">{formatPrice(v.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {item.addOns?.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-bold">Add-ons</legend>
            <div className="space-y-2">
              {item.addOns.map((a) => (
                <label
                  key={a._id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 px-4 py-3 ${addOnIds.includes(a._id) ? 'border-kulhad bg-surface-2' : 'border-line'} ${a.isAvailable === false ? 'opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-kulhad)]"
                      checked={addOnIds.includes(a._id)}
                      disabled={a.isAvailable === false}
                      onChange={() => toggle(a._id)}
                    />
                    <VegMark isVeg={a.isVeg !== false} />
                    {a.name}
                  </span>
                  <span className="font-bold tabular-nums">+ {formatPrice(a.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="item-note" className="mb-1.5 block font-bold">
            Special request <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="item-note"
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. less sugar"
            className="h-12 w-full rounded-xl border-2 border-line bg-surface px-4 focus:border-kulhad focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <QuantityStepper value={quantity} min={1} label={item.name} onChange={setQuantity} />
          <Button size="lg" className="flex-1" loading={busy} onClick={submit}>
            Add · {formatPrice(unit * quantity)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
