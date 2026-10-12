/**
 * Admin console E2E (see smoke.mjs for the required stack and env vars).
 * Extra env: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD for an existing admin account.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5055/api/v1';
const LOG = process.env.E2E_SERVER_LOG;
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/screenshots';
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
mkdirSync(SHOTS, { recursive: true });

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};
const json = (token) => ({
  'content-type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const call = async (method, path, { token, body, headers } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...json(token), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const lastOtp = () => {
  // eslint-disable-next-line no-control-regex
  const text = readFileSync(LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const m = [...text.matchAll(/otp[":\s]+"?(\d{6})/gi)].at(-1);
  if (!m) throw new Error('OTP not found in server log');
  return m[1];
};

/** Log a throwaway customer in through the API and return a token. */
async function customerToken() {
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  await call('POST', '/auth/otp/request', { body: { phone } });
  await new Promise((r) => setTimeout(r, 800));
  const res = await call('POST', '/auth/otp/verify', {
    body: { phone, otp: lastOtp(), name: 'Admin E2E Customer' },
  });
  return { token: res.body.data.accessToken, phone };
}

async function placeCodOrder() {
  const { token, phone } = await customerToken();
  const menu = (await call('GET', '/menu-items')).body.data;
  const chai = menu.find((i) => i.name === 'Adrak Chai');
  await call('POST', '/cart/items', { token, body: { menuItemId: chai._id, quantity: 6 } });
  const addr = await call('POST', '/addresses', {
    token,
    body: {
      name: 'E2E',
      phone,
      line1: '5 MG Road',
      city: 'Indore',
      state: 'MP',
      pincode: '452001',
    },
  });
  return call('POST', '/orders', {
    token,
    headers: { 'Idempotency-Key': `admin-e2e-${Date.now()}` },
    body: { addressId: addr.body.data._id, paymentMethod: 'cod' },
  });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1360, height: 860 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'e2e reason' : undefined));

try {
  console.log('Access control');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/staff-login');
  assert(true, 'guests are sent to the staff login');

  console.log('Staff login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  assert(true, 'admin lands on the dashboard');

  console.log('Dashboard');
  await page.getByText('Revenue (delivered)').waitFor();
  await page.waitForTimeout(1500);
  assert((await page.locator('svg[role="img"]').count()) >= 2, 'charts rendered');
  assert(await page.getByRole('heading', { name: 'Top items' }).isVisible(), 'top items panel');
  await page.screenshot({ path: `${SHOTS}/20-admin-dashboard.png` });
  await page.getByRole('button', { name: '30d' }).click();
  await page.waitForTimeout(800);
  assert(
    (await page.getByRole('button', { name: '30d' }).getAttribute('aria-pressed')) === 'true',
    'range switch works',
  );

  console.log('Live orders board');
  await page
    .getByRole('link', { name: /Orders/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Live orders' }).waitFor();
  await page.getByRole('button', { name: /enable sound alert/i }).click();
  assert(
    await page.getByRole('button', { name: /sound on/i }).isVisible(),
    'sound alert can be enabled',
  );
  const placed = await placeCodOrder();
  assert(placed.status === 201, 'customer placed an order');
  const num = placed.body.data.orderNumber;
  const card = page.getByRole('article', { name: `Order ${num}` });
  await card.waitFor({ timeout: 10000 });
  assert(true, 'new order appeared on the board without a reload (realtime)');
  await page.screenshot({ path: `${SHOTS}/21-admin-orders.png` });
  await card.getByRole('button', { name: 'Accept' }).click();
  await page
    .getByRole('region', { name: 'In kitchen' })
    .getByRole('article', { name: `Order ${num}` })
    .waitFor({ timeout: 8000 });
  assert(true, 'accepting moves the card to "In kitchen"');
  const st = await call('GET', `/orders/${placed.body.data._id}`, {
    token: (await customerToken()).token,
  });
  assert(st.status === 404, 'other customers still cannot read the order');

  console.log('Menu manager: stock toggle');
  await page.getByRole('link', { name: /Menu/ }).first().click();
  await page.getByRole('heading', { name: 'Menu' }).first().waitFor();
  const sw = page.getByRole('switch', { name: 'Veg Sandwich in stock' });
  await sw.waitFor();
  await sw.click();
  await page.waitForTimeout(800);
  let pub = (await call('GET', '/menu-items?available=false')).body.data;
  assert(true, `stock off recorded (public query returned ${pub.length} rows)`);
  const sandwich = (await call('GET', '/menu-items')).body.data.find(
    (i) => i.name === 'Veg Sandwich',
  );
  assert(
    sandwich.isAvailable === false,
    'public menu shows the item as sold out (cache invalidated)',
  );
  await page.screenshot({ path: `${SHOTS}/22-admin-menu.png` });
  await sw.click();
  await page.waitForTimeout(800);
  assert(
    (await call('GET', '/menu-items')).body.data.find((i) => i.name === 'Veg Sandwich')
      .isAvailable === true,
    'back in stock',
  );

  console.log('Bookings calendar');
  await page
    .getByRole('link', { name: /Bookings/ })
    .first()
    .click();
  await page.getByRole('grid', { name: 'Booking calendar' }).waitFor();
  await page.waitForTimeout(800);
  assert((await page.getByRole('gridcell').count()) >= 28, 'month grid rendered');
  await page.screenshot({ path: `${SHOTS}/23-admin-bookings.png` });

  console.log('Party inbox');
  await page
    .getByRole('link', { name: /Parties/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Party bookings' }).waitFor();
  await page.waitForTimeout(800);
  const inquiry = page.getByRole('button', { name: /^PI-/ }).first();
  await inquiry.waitFor();
  await inquiry.click();
  await page.getByRole('dialog').waitFor();
  assert(
    await page.getByRole('dialog').getByText('Timeline').isVisible(),
    'inquiry detail with timeline opens',
  );
  await page.screenshot({ path: `${SHOTS}/24-admin-party.png` });
  await page.keyboard.press('Escape');

  console.log('Settings: close the cafe');
  await page
    .getByRole('link', { name: /Settings/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByLabel('Accepting online orders').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(800);
  const blocked = await placeCodOrder();
  assert(blocked.status === 409, 'orders are refused while closed');
  await page.getByLabel('Accepting online orders').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(800);
  assert((await placeCodOrder()).status === 201, 'orders accepted again after reopening');

  console.log('Coupons');
  await page
    .getByRole('link', { name: /Coupons/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Coupons' }).waitFor();
  await page.getByRole('button', { name: '+ New coupon' }).click();
  const dlg = page.getByRole('dialog');
  const code = `E2E${Math.floor(Math.random() * 9000 + 1000)}`;
  await dlg.getByLabel('Code').fill(code);
  await dlg.getByLabel(/Percent/).fill('15');
  await dlg.getByLabel('Max discount (₹)').fill('75');
  await dlg.getByLabel('Minimum order (₹)').fill('100');
  await dlg.getByRole('button', { name: 'Save coupon' }).click();
  await page.getByText(code).waitFor();
  assert(true, `coupon ${code} created from the UI`);
  await page.screenshot({ path: `${SHOTS}/25-admin-coupons.png` });

  console.log('Users + reviews + banners');
  await page.getByRole('link', { name: /Users/ }).first().click();
  await page.getByRole('heading', { name: 'Users' }).waitFor();
  await page.waitForTimeout(700);
  assert((await page.getByRole('switch').count()) >= 2, 'users listed');
  await page
    .getByRole('link', { name: /Reviews/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Reviews' }).waitFor();
  await page
    .getByRole('link', { name: /Banners/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Banners' }).waitFor();
  assert(true, 'reviews and banners pages load');

  console.log('Role separation (staff)');
  const staffEmail = `staff${Date.now() % 100000}@jailkichai.local`;
  const adminLogin = await call('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const created = await call('POST', '/users', {
    token: adminLogin.body.data.accessToken,
    body: {
      name: 'Staff E2E',
      phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
      email: staffEmail,
      password: 'StaffPass-12345',
      role: 'staff',
    },
  });
  assert(created.status === 201, 'admin created a staff account');
  const ctx2 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/staff-login`, { waitUntil: 'networkidle' });
  await p2.getByLabel('Email').fill(staffEmail);
  await p2.getByLabel('Password').fill('StaffPass-12345');
  await p2.getByRole('button', { name: 'Sign in' }).click();
  await p2.waitForURL('**/admin/orders');
  assert(true, 'staff lands on the live orders board');
  assert(
    (await p2.getByRole('link', { name: /Coupons|Users|Banners/ }).count()) === 0,
    'admin-only sections are hidden from staff',
  );
  await p2.goto(`${BASE}/admin/coupons`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(500);
  assert(!p2.url().includes('/admin/coupons'), 'staff cannot open admin-only routes');
  await ctx2.close();

  const real = problems.filter(
    (p) => !/favicon|Failed to load resource.*(401|404|409|403)/i.test(p),
  );
  assert(real.length === 0, `no console/page errors${real.length ? `: ${real.join(' | ')}` : ''}`);
  console.log('\nADMIN E2E OK');
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/ADMIN-FAILURE.png` }).catch(() => {});
  console.error('\nADMIN E2E FAILED:', err.message);
  if (problems.length) console.error('Problems seen:\n  ' + problems.join('\n  '));
  process.exitCode = 1;
} finally {
  await browser.close();
}
