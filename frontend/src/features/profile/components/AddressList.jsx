import { useState } from 'react';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import { formatPhone } from '../../../lib/format.js';
import { useAddressMutations } from '../hooks.js';
import AddressForm from './AddressForm.jsx';

/** Saved addresses with add / edit / delete / make default. Optional `selectedId` + `onSelect` for checkout. */
export default function AddressList({ addresses, selectedId, onSelect, userName }) {
  const { create, update, remove, makeDefault } = useAddressMutations();
  const [editing, setEditing] = useState(null); // address | 'new' | null
  const selectable = typeof onSelect === 'function';

  return (
    <div className="space-y-3">
      {addresses.map((a) => {
        const picked = selectable && selectedId === a._id;
        return (
          <div key={a._id} className={`card flex gap-3 p-4 ${picked ? 'ring-2 ring-kulhad' : ''}`}>
            {selectable && (
              <input
                type="radio"
                name="address"
                checked={picked}
                onChange={() => onSelect(a._id)}
                aria-label={`Deliver to ${a.label} address, ${a.line1}`}
                className="mt-1.5 h-5 w-5 accent-[var(--color-kulhad)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold capitalize">
                {a.label}
                {a.isDefault && <Badge tone="success">Default</Badge>}
              </p>
              <p className="text-sm">
                {a.name} · {formatPhone(a.phone)}
              </p>
              <p className="text-sm text-muted">
                {[a.line1, a.line2, a.landmark, a.city, a.state, a.pincode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-brand">
                <button onClick={() => setEditing(a)} className="underline">
                  Edit
                </button>
                {!a.isDefault && (
                  <button onClick={() => makeDefault.mutate(a._id)} className="underline">
                    Make default
                  </button>
                )}
                <button
                  onClick={() => window.confirm('Delete this address?') && remove.mutate(a._id)}
                  className="text-nonveg underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <Button variant="outline" onClick={() => setEditing('new')} className="w-full">
        + Add new address
      </Button>
      {editing && (
        <AddressForm
          open
          initial={editing === 'new' ? undefined : editing}
          defaultValues={{ name: userName ?? '' }}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            editing === 'new'
              ? create.mutateAsync(values).then((a) => onSelect?.(a._id))
              : update.mutateAsync({ id: editing._id, ...values })
          }
        />
      )}
    </div>
  );
}
