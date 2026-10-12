const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading;

/** Load Razorpay Checkout once, on demand (not part of the initial bundle). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => {
      loading = undefined;
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
