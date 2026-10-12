import { useNavigate } from 'react-router-dom';
import Button from '../../../components/ui/Button.jsx';
import Drawer from '../../../components/ui/Drawer.jsx';
import { formatPrice } from '../../../lib/format.js';
import { useAuthStore } from '../../auth/authStore.js';
import { useCart, useCartDrawer } from '../useCart.js';
import CartLines, { CartEmpty } from './CartLines.jsx';

export default function CartDrawer() {
  const { open, closeCart } = useCartDrawer();
  const { view, setQuantity, remove } = useCart();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const navigate = useNavigate();
  const empty = view.items.length === 0;

  const checkout = () => {
    closeCart();
    navigate(authed ? '/checkout' : '/login', { state: { from: { pathname: '/checkout' } } });
  };

  return (
    <Drawer
      open={open}
      onClose={closeCart}
      title="Your cart"
      footer={
        !empty && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-lg">
              <span className="font-bold">Subtotal</span>
              <span className="font-bold tabular-nums">{formatPrice(view.summary.subtotal)}</span>
            </div>
            <p className="text-sm text-muted">Delivery and offers are calculated at checkout.</p>
            <Button
              size="lg"
              className="w-full"
              onClick={checkout}
              disabled={view.hasIssues && view.summary.subtotal === 0}
            >
              {authed ? 'Checkout' : 'Login to checkout'}
            </Button>
          </div>
        )
      }
    >
      {empty ? (
        <CartEmpty onBrowse={closeCart} />
      ) : (
        <CartLines items={view.items} onQuantity={setQuantity} onRemove={remove} compact />
      )}
    </Drawer>
  );
}
