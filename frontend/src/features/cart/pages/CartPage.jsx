import { useNavigate } from 'react-router-dom';
import Seo from '../../../components/common/Seo.jsx';
import Button from '../../../components/ui/Button.jsx';
import { ErrorState } from '../../../components/ui/States.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { formatPrice } from '../../../lib/format.js';
import { useAuthStore } from '../../auth/authStore.js';
import CartLines, { CartEmpty } from '../components/CartLines.jsx';
import { useCart } from '../useCart.js';

export default function CartPage() {
  const { view, isLoading, isError, refetch, setQuantity, remove, clear } = useCart();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const navigate = useNavigate();

  return (
    <div className="container-page max-w-2xl py-8">
      <Seo title="Your cart" noindex />
      <div className="mb-4 flex items-end justify-between">
        <h1 className="text-4xl">Your cart</h1>
        {view.items.length > 0 && (
          <button onClick={clear} className="text-sm font-bold text-muted underline hover:text-fg">
            Clear all
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message="We couldn't load your cart." onRetry={refetch} />
      ) : view.items.length === 0 ? (
        <CartEmpty />
      ) : (
        <div className="card p-5">
          <CartLines items={view.items} onQuantity={setQuantity} onRemove={remove} />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-4 text-lg">
            <span className="font-bold">Subtotal</span>
            <span className="font-bold tabular-nums">{formatPrice(view.summary.subtotal)}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Delivery charge, taxes and coupons are applied at checkout.
          </p>
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={() =>
              navigate(authed ? '/checkout' : '/login', {
                state: { from: { pathname: '/checkout' } },
              })
            }
          >
            {authed ? 'Proceed to checkout' : 'Login to checkout'}
          </Button>
        </div>
      )}
    </div>
  );
}
