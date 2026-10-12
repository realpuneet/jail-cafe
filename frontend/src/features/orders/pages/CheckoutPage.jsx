import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input from '../../../components/ui/Input.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { toApiError } from '../../../lib/apiError.js';
import { formatPrice } from '../../../lib/format.js';
import { gsap, useGSAP, prefersReducedMotion } from '../../../lib/gsap.js';
import { newIdempotencyKey } from '../../../lib/id.js';
import { keys } from '../../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useCart } from '../../cart/useCart.js';
import CartLines from '../../cart/components/CartLines.jsx';
import { usePublicCoupons } from '../../menu/hooks.js';
import AddressList from '../../profile/components/AddressList.jsx';
import { useAddresses } from '../../profile/hooks.js';
import { toast } from '../../ui/uiStore.js';
import { placeOrder, previewOrder } from '../api.js';
import { payForOrder } from '../payment.js';

const STEPS = ['Where', 'Offers & pay', 'Review'];

function Stepper({ step }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Checkout steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? 'step' : undefined}
          className="flex flex-1 items-center gap-2"
        >
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i <= step ? 'bg-kulhad text-white dark:bg-saffron dark:text-iron' : 'bg-line text-muted'}`}
          >
            {i < step ? '✓' : i + 1}
          </span>
          <span className={`hidden text-sm font-bold sm:inline ${i === step ? '' : 'text-muted'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className={`h-0.5 flex-1 rounded ${i < step ? 'bg-kulhad dark:bg-saffron' : 'bg-line'}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function Totals({ pricing }) {
  const rows = [
    ['Subtotal', pricing.subtotal],
    pricing.discount > 0 && ['Discount', -pricing.discount],
    ['Delivery', pricing.deliveryCharge],
  ].filter(Boolean);
  return (
    <dl className="space-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <dt className="text-muted">{k}</dt>
          <dd className="tabular-nums">
            {k === 'Delivery' && v === 0 ? (
              <span className="font-bold text-veg">FREE</span>
            ) : (
              formatPrice(v)
            )}
          </dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-2 text-xl font-bold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatPrice(pricing.total)}</dd>
      </div>
      <p className="text-right text-xs text-muted">
        Includes {formatPrice(pricing.taxIncluded)} GST
      </p>
    </dl>
  );
}

/** 3-step checkout: address -> offers & payment -> review & place. Prices come from the server preview. */
export default function CheckoutPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { view, setCoupon, couponPending, setQuantity, remove } = useCart();
  const { data: addresses = [], isLoading: addrLoading } = useAddresses();
  const { data: offers = [] } = usePublicCoupons();

  const [step, setStep] = useState(0);
  const [type, setType] = useState('delivery');
  const [addressId, setAddressId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('online');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const effectiveAddress =
    type === 'delivery'
      ? (addressId ?? addresses.find((a) => a.isDefault)?._id ?? addresses[0]?._id ?? null)
      : null;
  const ready = view.items.length > 0 && (type === 'pickup' || Boolean(effectiveAddress));

  const preview = useQuery({
    queryKey: keys.checkoutPreview({
      type,
      addressId: effectiveAddress,
      coupon: view.coupon?.code,
      sig: view.summary.subtotal,
    }),
    queryFn: () =>
      previewOrder({ type, ...(effectiveAddress ? { addressId: effectiveAddress } : {}) }),
    enabled: ready,
    retry: false,
  });
  const previewError = preview.isError ? toApiError(preview.error).message : null;

  const body = useMemo(
    () => ({
      type,
      addressId: effectiveAddress ?? undefined,
      paymentMethod,
      note: note.trim() || undefined,
    }),
    [type, effectiveAddress, paymentMethod, note],
  );
  // One Idempotency-Key per distinct checkout payload: retrying the same request reuses it,
  // changing anything (address, coupon, total…) mints a new one.
  const signature = JSON.stringify([body, view.summary.subtotal, view.coupon?.code]);
  const keyRef = useRef({ signature, key: newIdempotencyKey() });
  if (keyRef.current.signature !== signature)
    keyRef.current = { signature, key: newIdempotencyKey() };
  const idemKey = keyRef.current.key;

  const panel = useRef(null);
  useGSAP(
    () => {
      if (!prefersReducedMotion()) gsap.from(panel.current, { opacity: 0, x: 24, duration: 0.4 });
    },
    { scope: panel, dependencies: [step], revertOnUpdate: true },
  );

  const place = useMutation({
    mutationFn: async () => {
      const order = await placeOrder(body, idemKey);
      qc.invalidateQueries({ queryKey: keys.cart });
      qc.invalidateQueries({ queryKey: keys.orders });
      return order;
    },
    onSuccess: async (order) => {
      if (order.payment.method === 'online' && order.payment.status === 'pending') {
        try {
          const res = await payForOrder(order, {
            name: user?.name,
            phone: user?.phone,
            email: user?.email,
          });
          if (res.status === 'dismissed')
            toast.info('Payment pending. You can complete it from your order page.');
        } catch (err) {
          toast.error(toApiError(err).message);
        }
      }
      navigate(`/orders/${order._id}?placed=1`, { replace: true });
    },
    onError: (err) => {
      const e = toApiError(err);
      toast.error(e.message);
      if (e.status === 409 || e.code === 'BAD_REQUEST')
        qc.invalidateQueries({ queryKey: keys.cart });
    },
  });

  const applyCode = async (value) => {
    setCodeError('');
    try {
      await setCoupon(value);
      setCode('');
    } catch (err) {
      setCodeError(toApiError(err).message);
    }
  };

  if (view.items.length === 0 && !place.isPending && !place.isSuccess)
    return <Navigate to="/menu" replace />;

  const canNext = step === 0 ? ready && !previewError : true;
  const data = preview.data;

  return (
    <div className="container-page max-w-3xl py-8">
      <Seo title="Checkout" noindex />
      <h1 className="mb-6 text-4xl">Checkout</h1>
      <Stepper step={step} />

      <div ref={panel} className="space-y-6">
        {step === 0 && (
          <>
            <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-3">
              {[
                ['delivery', '🛵', 'Delivery', 'To your door'],
                ['pickup', '🛍️', 'Pickup', 'Collect from the cafe'],
              ].map(([v, icon, label, sub]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={type === v}
                  onClick={() => setType(v)}
                  className={`card p-4 text-left ${type === v ? 'ring-2 ring-kulhad' : ''}`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {icon}
                  </span>
                  <p className="font-bold">{label}</p>
                  <p className="text-sm text-muted">{sub}</p>
                </button>
              ))}
            </div>
            {type === 'delivery' &&
              (addrLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <AddressList
                  addresses={addresses}
                  selectedId={effectiveAddress}
                  onSelect={setAddressId}
                  userName={user?.name}
                />
              ))}
            {previewError && (
              <p
                role="alert"
                className="rounded-xl bg-red-100 p-4 font-medium text-red-900 dark:bg-red-900/30 dark:text-red-200"
              >
                {previewError}
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <section className="card space-y-3 p-5" aria-labelledby="coupon-h">
              <h2 id="coupon-h" className="text-2xl">
                Offers
              </h2>
              {view.coupon && !view.coupon.error ? (
                <div className="flex items-center justify-between rounded-xl bg-green-100 px-4 py-3 text-green-900 dark:bg-green-900/30 dark:text-green-200">
                  <p>
                    <strong>{view.coupon.code}</strong> applied · you save{' '}
                    {formatPrice(view.coupon.discount)}
                  </p>
                  <button onClick={() => applyCode(null)} className="font-bold underline">
                    Remove
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) applyCode(code.trim().toUpperCase());
                  }}
                  className="flex items-start gap-2"
                >
                  <Input
                    label="Coupon code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    error={codeError || view.coupon?.error}
                    className="flex-1"
                    autoCapitalize="characters"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="mt-[1.85rem]"
                    loading={couponPending}
                  >
                    Apply
                  </Button>
                </form>
              )}
              {offers.length > 0 && !view.coupon && (
                <ul className="flex flex-wrap gap-2">
                  {offers.map((o) => (
                    <li key={o.code}>
                      <button
                        onClick={() => applyCode(o.code)}
                        className="rounded-full border-2 border-dashed border-kulhad px-3 py-1 text-sm font-bold text-kulhad dark:border-saffron dark:text-saffron"
                        title={o.description}
                      >
                        {o.code}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <fieldset className="card space-y-3 p-5">
              <legend className="px-1 text-2xl font-display">Payment</legend>
              {[
                ['online', 'Pay online', 'UPI, cards, netbanking, wallets'],
                [
                  'cod',
                  type === 'pickup' ? 'Pay at the counter' : 'Cash on delivery',
                  'Pay when you receive your order',
                ],
              ].map(([v, label, sub]) => (
                <label
                  key={v}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${paymentMethod === v ? 'border-kulhad bg-surface-2' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="pay"
                    checked={paymentMethod === v}
                    onChange={() => setPaymentMethod(v)}
                    className="h-5 w-5 accent-[var(--color-kulhad)]"
                  />
                  <span>
                    <span className="block font-bold">{label}</span>
                    <span className="text-sm text-muted">{sub}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor="order-note" className="mb-1.5 block font-bold">
                Note for the kitchen <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="order-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border-2 border-line bg-surface p-3 focus:border-kulhad focus:outline-none"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <section className="card p-5" aria-labelledby="rev-h">
              <h2 id="rev-h" className="mb-1 text-2xl">
                Your order
              </h2>
              <CartLines items={view.items} onQuantity={setQuantity} onRemove={remove} compact />
            </section>
            {preview.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : previewError ? (
              <p role="alert" className="rounded-xl bg-red-100 p-4 font-medium text-red-900">
                {previewError}
              </p>
            ) : (
              data && (
                <section className="card space-y-4 p-5" aria-labelledby="bill-h">
                  <h2 id="bill-h" className="text-2xl">
                    Bill details
                  </h2>
                  <Totals pricing={data.pricing} />
                  <div className="rounded-xl bg-surface-2 p-3 text-sm">
                    {type === 'delivery' ? (
                      <>
                        🛵 {data.delivery?.zoneName} · ~{data.delivery?.estimatedMinutes} min
                      </>
                    ) : (
                      <>🛍️ Pickup from the cafe</>
                    )}{' '}
                    ·{' '}
                    {paymentMethod === 'online'
                      ? 'Pay online'
                      : type === 'pickup'
                        ? 'Pay at the counter'
                        : 'Cash on delivery'}
                  </div>
                </section>
              )
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-16 -mx-4 mt-8 flex gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button
            className="flex-1"
            size="lg"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button
            className="flex-1"
            size="lg"
            loading={place.isPending}
            disabled={!data || Boolean(previewError)}
            onClick={() => place.mutate()}
          >
            {paymentMethod === 'online'
              ? `Pay ${data ? formatPrice(data.pricing.total) : ''}`
              : `Place order ${data ? '· ' + formatPrice(data.pricing.total) : ''}`}
          </Button>
        )}
      </div>
    </div>
  );
}
