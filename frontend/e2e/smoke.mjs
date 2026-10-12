/**
 * End-to-end smoke test against a locally running stack (API + Mongo + Redis + built frontend).
 *
 *   E2E_BASE_URL=http://localhost:4173 E2E_API_URL=http://localhost:5055/api/v1 \
 *   E2E_SERVER_LOG=/path/to/api.log E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node e2e/smoke.mjs
 *
 * The API must run with NODE_ENV=development and LOG_LEVEL=debug: with no SMS provider the OTP is
 * written to the log, which is how this script logs in. Not part of CI (needs the full stack).
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5055/api/v1';
const LOG = process.env.E2E_SERVER_LOG;
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/screenshots';
const PHONE = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
mkdirSync(SHOTS, { recursive: true });

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};
const lastOtp = () => {
  // eslint-disable-next-line no-control-regex
  const text = readFileSync(LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const m = [...text.matchAll(/otp[":\s]+"?(\d{6})/gi)].at(-1);
  if (!m) throw new Error('OTP not found in server log');
  return m[1];
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

try {
  console.log('Home');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  assert(
    (await page.locator('h1').innerText()).replace(/\s+/g, ' ').toLowerCase().includes('break out'),
    'hero headline renders',
  );
  await page.screenshot({ path: `${SHOTS}/01-home-mobile.png` });

  console.log('Menu (guest)');
  await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('article');
  const count = await page.locator('article').count();
  assert(count >= 9, `menu shows seeded items (${count})`);
  await page.fill('#menu-search', 'burger');
  await page.waitForTimeout(500);
  assert((await page.locator('article').count()) === 2, 'search filters to the 2 burgers');
  await page.getByRole('switch', { name: /veg only/i }).click();
  await page.waitForTimeout(300);
  assert((await page.locator('article').count()) === 1, 'veg toggle leaves only the veg burger');
  await page.fill('#menu-search', '');
  await page.getByRole('switch', { name: /veg only/i }).click();
  await page.waitForTimeout(500);

  // Customise item with variants (Masala Chai has Cutting / Full)
  const chai = page.locator('article', { hasText: 'Masala Chai' }).first();
  await chai.getByRole('button', { name: /customise/i }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel(/Full/).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Add ·/ })
    .click();
  await page.waitForTimeout(400);
  // plain add for a simple item, 6 times -> subtotal above the delivery minimum
  const roll = page.locator('article', { hasText: 'Veg Burger' }).first();
  for (let i = 0; i < 2; i++) await roll.getByRole('button', { name: /add veg burger/i }).click();
  await page.screenshot({ path: `${SHOTS}/02-menu-mobile.png` });

  console.log('Cart drawer (guest)');
  await page.getByRole('button', { name: /open cart/i }).click();
  await page.getByRole('dialog', { name: 'Your cart' }).waitFor();
  assert((await page.getByRole('dialog').locator('li').count()) === 2, 'drawer lists 2 lines');
  assert(
    await page.getByRole('button', { name: /login to checkout/i }).isVisible(),
    'guest is asked to log in',
  );
  await page.screenshot({ path: `${SHOTS}/03-cart-drawer.png` });
  await page.getByRole('button', { name: /login to checkout/i }).click();

  console.log('OTP login');
  await page.waitForURL('**/login');
  await page.fill('input[type=tel]', PHONE);
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.getByLabel('6-digit OTP').waitFor();
  await page.waitForTimeout(800);
  await page.fill('input[maxlength="6"]', lastOtp());
  await page.getByLabel(/your name/i).fill('E2E Tester');
  await page.screenshot({ path: `${SHOTS}/04-login-otp.png` });
  await page.getByRole('button', { name: /verify/i }).click();
  await page.waitForURL('**/checkout');
  assert(true, 'redirected back to checkout after login');

  console.log('Checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await page.getByRole('button', { name: /add new address/i }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Full name').fill('E2E Tester');
  await dlg.getByLabel('Mobile number').fill(PHONE);
  await dlg.getByLabel('House / flat, street').fill('12 MG Road');
  await dlg.getByLabel('City').fill('Indore');
  await dlg.getByLabel('State').fill('Madhya Pradesh');
  await dlg.getByLabel('Pincode').fill('452001');
  await dlg.getByRole('button', { name: 'Save address' }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/05-checkout-address.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Cash on delivery').click();
  await page.screenshot({ path: `${SHOTS}/06-checkout-payment.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Bill details' }).waitFor();
  assert(
    (await page.getByText('FREE').count()) === 0,
    'delivery charge shown (not free under threshold)',
  );
  await page.screenshot({ path: `${SHOTS}/07-checkout-review.png` });
  await page.getByRole('button', { name: /place order/i }).click();

  console.log('Tracking');
  await page.waitForURL('**/orders/*?placed=1');
  await page.getByText('Order placed!').waitFor();
  const orderNumber = (await page.locator('h1').innerText()).trim();
  assert(/^JKC-\d{6}-\d{4}$/.test(orderNumber), `order number ${orderNumber}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/08-tracking-placed.png` });

  console.log('Realtime status update (staff accepts via API)');
  const login = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.E2E_ADMIN_EMAIL,
        password: process.env.E2E_ADMIN_PASSWORD,
      }),
    })
  ).json();
  const staff = {
    Authorization: `Bearer ${login.data.accessToken}`,
    'content-type': 'application/json',
  };
  const orderId = page.url().match(/orders\/([a-f0-9]{24})/)[1];
  const set = (status) =>
    fetch(`${API}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: staff,
      body: JSON.stringify({ status }),
    }).then((r) => r.json());
  assert((await set('ACCEPTED')).success, 'staff accepted the order');
  await page.locator('[aria-current="step"]', { hasText: 'Accepted' }).waitFor({ timeout: 8000 });
  assert(true, 'customer page moved to "Accepted" without a reload');
  await set('PREPARING');
  await page.locator('[aria-current="step"]', { hasText: 'Preparing' }).waitFor({ timeout: 8000 });
  assert(true, 'moved to "Preparing" live');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/09-tracking-preparing.png` });

  console.log('My orders + profile');
  await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' });
  assert(await page.getByText(orderNumber).isVisible(), 'order appears in history');
  await page.screenshot({ path: `${SHOTS}/10-my-orders.png` });
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  assert(await page.getByText('Saved addresses').isVisible(), 'profile shows addresses');

  console.log('Session survives reload (refresh cookie)');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert(page.url().endsWith('/profile'), 'still on /profile after reload');

  console.log('Desktop + dark');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /toggle dark mode/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/11-home-desktop-dark.png` });
  await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/12-menu-desktop-dark.png` });

  console.log('Unknown route');
  await page.goto(`${BASE}/nope`, { waitUntil: 'networkidle' });
  assert(await page.getByText(/this page escaped/i).isVisible(), '404 page');

  const real = problems.filter((p) => !/favicon|Failed to load resource.*(401|404)/i.test(p));
  assert(real.length === 0, `no console/page errors${real.length ? `: ${real.join(' | ')}` : ''}`);
  console.log('\nE2E OK');
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/FAILURE.png` }).catch(() => {});
  console.error('\nE2E FAILED:', err.message);
  if (problems.length) console.error('Problems seen:\n  ' + problems.join('\n  '));
  process.exitCode = 1;
} finally {
  await browser.close();
}
