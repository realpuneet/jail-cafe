import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/ui/Button.jsx';
import { ErrorState } from '../../../components/ui/States.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { api, unwrap, unwrapWithMeta } from '../../../lib/axios.js';
import { formatPrice } from '../../../lib/format.js';
import { toast, useUiStore } from '../../ui/uiStore.js';
import { useRepeatingAlert } from '../hooks.js';
import { playAlert, unlockAudio } from '../sound.js';

const COLUMNS = [
  { key: 'new', title: 'New', statuses: ['PLACED'], tone: 'warning' },
  { key: 'kitchen', title: 'In kitchen', statuses: ['ACCEPTED', 'PREPARING'], tone: 'warning' },
  { key: 'ready', title: 'Ready', statuses: ['READY'], tone: 'success' },
  { key: 'out', title: 'On the way', statuses: ['OUT_FOR_DELIVERY'], tone: 'success' },
];

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

function OrderCard({ order, riders, onStatus, onAssign, busy }) {
  const o = order;
  const delivery = o.type === 'delivery';
  const next =
    {
      PLACED: [['ACCEPTED', 'Accept', 'primary']],
      ACCEPTED: [['PREPARING', 'Start preparing', 'primary']],
      PREPARING: [['READY', 'Mark ready', 'primary']],
      READY: delivery
        ? [['OUT_FOR_DELIVERY', 'Out for delivery', 'primary']]
        : [['DELIVERED', 'Handed over', 'primary']],
      OUT_FOR_DELIVERY: [['DELIVERED', 'Delivered', 'primary']],
    }[o.status] ?? [];

  return (
    <article
      className={`card space-y-3 p-4 ${o.status === 'PLACED' ? 'ring-2 ring-saffron' : ''}`}
      aria-label={`Order ${o.orderNumber}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{o.orderNumber}</p>
          <p className="text-xs text-muted">
            {ago(o.createdAt)} · {delivery ? `🛵 ${o.address?.pincode ?? ''}` : '🛍️ Pickup'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{formatPrice(o.pricing.total)}</p>
          <Badge tone={o.payment.status === 'paid' ? 'success' : 'warning'}>
            {o.payment.method === 'cod'
              ? o.payment.status === 'paid'
                ? 'Cash · paid'
                : 'Cash'
              : `Online · ${o.payment.status}`}
          </Badge>
        </div>
      </div>
      <ul className="space-y-0.5 text-sm">
        {o.items.map((i, idx) => (
          <li key={idx}>
            <strong>{i.quantity}×</strong> {i.name}
            {i.variantName ? ` (${i.variantName})` : ''}
            {i.addOns?.length ? (
              <span className="text-muted"> + {i.addOns.map((a) => a.name).join(', ')}</span>
            ) : null}
            {i.note ? <em className="text-muted"> “{i.note}”</em> : null}
          </li>
        ))}
      </ul>
      {o.note && <p className="rounded-lg bg-surface-2 p-2 text-sm">📝 {o.note}</p>}
      {delivery && o.address && (
        <p className="text-sm text-muted">
          {o.address.name} · {o.address.phone}
          <br />
          {[o.address.line1, o.address.landmark, o.address.city].filter(Boolean).join(', ')}
        </p>
      )}

      {delivery && ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status) && (
        <div>
          <label className="mb-1 block text-xs font-bold" htmlFor={`rider-${o._id}`}>
            Rider
          </label>
          <select
            id={`rider-${o._id}`}
            value={o.riderId ?? ''}
            onChange={(e) => e.target.value && onAssign(o._id, e.target.value)}
            className="h-10 w-full rounded-lg border-2 border-line bg-surface px-2"
          >
            <option value="">{riders.length ? 'Assign a rider…' : 'No riders yet'}</option>
            {riders.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name || r.phone}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {next.map(([status, label]) => (
          <Button key={status} size="sm" loading={busy} onClick={() => onStatus(o._id, status)}>
            {label}
          </Button>
        ))}
        {o.status === 'PLACED' && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => {
              const note = window.prompt('Reason for rejecting (shown to the customer)');
              if (note !== null) onStatus(o._id, 'REJECTED', note || 'Rejected by the cafe');
            }}
          >
            Reject
          </Button>
        )}
        {o.status !== 'PLACED' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const note = window.prompt('Reason for cancelling');
              if (note !== null) onStatus(o._id, 'CANCELLED', note || 'Cancelled by the cafe');
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </article>
  );
}

/** Live kitchen board. Realtime events (see useStaffRealtime) refresh it instantly; polling is the safety net. */
export default function OrdersBoardPage() {
  const qc = useQueryClient();
  const soundOn = useUiStore((s) => s.soundOn);
  const setSoundOn = useUiStore((s) => s.setSoundOn);
  const [tab, setTab] = useState('active');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const active = useQuery({
    queryKey: ['admin', 'orders', 'active'],
    queryFn: () =>
      api.get('/orders/manage', { params: { active: true, limit: 100 } }).then(unwrapWithMeta),
    refetchInterval: 30_000,
  });
  const history = useQuery({
    queryKey: ['admin', 'orders', 'history'],
    queryFn: () =>
      api
        .get('/orders/manage', { params: { status: 'DELIVERED,CANCELLED,REJECTED', limit: 30 } })
        .then(unwrapWithMeta),
    enabled: tab === 'history',
  });
  const ridersQ = useQuery({
    queryKey: ['admin', 'riders'],
    queryFn: () =>
      api
        .get('/users', { params: { role: 'rider', isActive: true, limit: 100 } })
        .then(unwrapWithMeta),
    staleTime: 60_000,
  });
  const riders = ridersQ.data?.data ?? [];
  const orders = active.data?.data ?? [];
  const hasNew = orders.some((o) => o.status === 'PLACED');
  useRepeatingAlert(hasNew);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
  const status = useMutation({
    mutationFn: ({ id, to, note }) =>
      api.patch(`/orders/${id}/status`, { status: to, note }).then(unwrap),
    onSuccess: refresh,
    onError: (err) => {
      toast.error(toApiError(err).message);
      refresh();
    },
  });
  const assign = useMutation({
    mutationFn: ({ id, riderId }) => api.patch(`/orders/${id}/assign`, { riderId }).then(unwrap),
    onSuccess: () => {
      toast.success('Rider assigned');
      refresh();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const toggleSound = () => {
    if (!soundOn) {
      if (!unlockAudio()) return toast.error('This browser cannot play alert sounds.');
      playAlert();
    }
    setSoundOn(!soundOn);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">Live orders</h1>
          <p className="text-muted">{orders.length} active · updates in real time</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={soundOn ? 'accent' : 'outline'}
            onClick={toggleSound}
            aria-pressed={soundOn}
          >
            {soundOn ? '🔔 Sound on' : '🔕 Enable sound alert'}
          </Button>
          <div
            role="group"
            aria-label="View"
            className="flex rounded-full border-2 border-line p-0.5"
          >
            {[
              ['active', 'Active'],
              ['history', 'History'],
            ].map(([k, l]) => (
              <button
                key={k}
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-full px-4 py-1.5 font-bold ${tab === k ? 'bg-chai-700 text-white dark:bg-saffron dark:text-iron' : ''}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'active' ? (
        active.isError ? (
          <ErrorState onRetry={active.refetch} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const list = orders
                .filter((o) => col.statuses.includes(o.status))
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              return (
                <section key={col.key} aria-label={col.title} className="min-w-0 space-y-3">
                  <h2 className="flex items-center justify-between font-sans text-lg font-bold">
                    {col.title} <Badge tone={col.tone}>{list.length}</Badge>
                  </h2>
                  {list.length === 0 && (
                    <p className="rounded-xl border-2 border-dashed border-line p-6 text-center text-sm text-muted">
                      Nothing here
                    </p>
                  )}
                  {list.map((o) => (
                    <OrderCard
                      key={o._id}
                      order={o}
                      riders={riders}
                      busy={status.isPending}
                      onStatus={(id, to, note) => status.mutate({ id, to, note })}
                      onAssign={(id, riderId) => assign.mutate({ id, riderId })}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="card divide-y divide-line">
          {(history.data?.data ?? []).map((o) => (
            <div key={o._id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-bold">{o.orderNumber}</p>
                <p className="text-sm text-muted">
                  {new Date(o.createdAt).toLocaleString('en-IN')} · {o.items.length} items
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold tabular-nums">{formatPrice(o.pricing.total)}</span>
                <Badge tone={o.status === 'DELIVERED' ? 'success' : 'danger'}>{o.status}</Badge>
              </div>
            </div>
          ))}
          {history.isLoading && <p className="p-4">Loading…</p>}
          {history.data && history.data.data.length === 0 && (
            <p className="p-6 text-center text-muted">No finished orders yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
