import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { ErrorState } from '../../../components/ui/States.jsx';
import { useCountUp } from '../../../hooks/useCountUp.js';
import { api, unwrap } from '../../../lib/axios.js';
import { formatPrice } from '../../../lib/format.js';
import { BarChart, LineChart } from '../components/Charts.jsx';
import { Panel, Switch } from '../components/Fields.jsx';
import { useSettings } from './SettingsPage.jsx';

const rupeeShort = (paise) => {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(r >= 1000000 ? 0 : 1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
};

/** KPI tile with a counting-up number and the change vs the previous period. */
function Kpi({
  label,
  value,
  previous,
  format = (n) => Math.round(n).toLocaleString('en-IN'),
  hint,
}) {
  const ref = useCountUp(value, format);
  const delta = previous > 0 ? Math.round(((value - previous) / previous) * 100) : null;
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p
        ref={ref}
        className="mt-1 text-3xl font-bold tabular-nums"
        aria-label={`${label}: ${format(value)}`}
      >
        {format(0)}
      </p>
      <p className="mt-1 text-sm">
        {delta === null ? (
          <span className="text-muted">{hint ?? 'No previous data'}</span>
        ) : (
          <span className={delta >= 0 ? 'font-bold text-veg' : 'font-bold text-nonveg'}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
            <span className="font-normal text-muted"> vs previous</span>
          </span>
        )}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const {
    data: d,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: () => api.get('/admin/analytics/dashboard', { params: { days } }).then(unwrap),
    refetchInterval: 60_000,
  });
  const settings = useSettings();

  if (isError) return <ErrorState onRetry={refetch} />;
  const short = (iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">Dashboard</h1>
          <p className="text-muted">
            {d ? `${short(d.range.from)} – ${short(d.range.to)}` : 'Loading…'}
          </p>
        </div>
        <div
          role="group"
          aria-label="Date range"
          className="flex rounded-full border-2 border-line p-0.5"
        >
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              aria-pressed={days === n}
              onClick={() => setDays(n)}
              className={`rounded-full px-4 py-1.5 font-bold ${days === n ? 'bg-chai-700 text-white dark:bg-saffron dark:text-iron' : ''}`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {settings.data && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="font-bold">
            {settings.data.acceptingOrders ? '🟢 Cafe is accepting orders' : '🔴 Orders are paused'}
          </p>
          <label className="flex items-center gap-2 text-sm">
            Accepting orders{' '}
            <Switch
              checked={settings.data.acceptingOrders}
              onChange={(v) => settings.save({ acceptingOrders: v })}
              label="Accepting orders"
            />
          </label>
        </div>
      )}

      {isLoading || !d ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-label="Loading dashboard"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Revenue (delivered)"
              value={d.totals.revenue}
              previous={d.previous.revenue}
              format={(n) => formatPrice(Math.round(n))}
            />
            <Kpi label="Orders" value={d.totals.orders} previous={d.previous.orders} />
            <Kpi
              label="Avg order value"
              value={d.averageOrderValue}
              previous={
                d.previous.delivered ? Math.round(d.previous.revenue / d.previous.delivered) : 0
              }
              format={(n) => formatPrice(Math.round(n))}
            />
            <Kpi label="Table bookings" value={d.totals.bookings} previous={d.previous.bookings} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Link to="/admin/orders" className="card p-4 hover:shadow-lg">
              <p className="text-sm text-muted">Active orders now</p>
              <p className="text-3xl font-bold tabular-nums">{d.live.activeOrders}</p>
            </Link>
            <Link to="/admin/bookings" className="card p-4 hover:shadow-lg">
              <p className="text-sm text-muted">Upcoming confirmed bookings</p>
              <p className="text-3xl font-bold tabular-nums">{d.live.upcomingBookings}</p>
            </Link>
            <Link to="/admin/party" className="card p-4 hover:shadow-lg">
              <p className="text-sm text-muted">Open party inquiries</p>
              <p className="text-3xl font-bold tabular-nums">{d.live.openPartyInquiries}</p>
            </Link>
          </div>

          <Panel title="Revenue by day">
            <LineChart
              caption="Revenue by day"
              data={d.series.map((s) => ({ label: short(s.date), value: s.revenue }))}
              format={rupeeShort}
            />
          </Panel>
          <Panel title="Orders by day">
            <BarChart
              caption="Orders by day"
              color="var(--color-kulhad)"
              data={d.series.map((s) => ({ label: short(s.date), value: s.orders }))}
            />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Orders by hour (IST)">
              <BarChart
                caption="Orders by hour of day"
                data={d.byHour.map((v, h) => ({ label: `${h}h`, value: v }))}
              />
            </Panel>
            <Panel title="Top items">
              {d.topItems.length === 0 ? (
                <p className="text-muted">No sales in this period yet.</p>
              ) : (
                <ol className="space-y-3">
                  {d.topItems.map((i) => (
                    <li key={i.menuItemId}>
                      <div className="flex justify-between text-sm">
                        <span className="font-bold">{i.name}</span>
                        <span className="tabular-nums text-muted">
                          {i.quantity} sold · {formatPrice(i.revenue)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-line">
                        <div
                          className="h-full origin-left rounded bg-saffron"
                          style={{ transform: `scaleX(${i.quantity / d.topItems[0].quantity})` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
          <p className="text-sm text-muted">
            Totals include {d.totals.cancelled} cancelled/rejected orders; revenue counts delivered
            orders only. Past days come from nightly rollups, today refreshes every 30 s.
          </p>
        </>
      )}
    </div>
  );
}
