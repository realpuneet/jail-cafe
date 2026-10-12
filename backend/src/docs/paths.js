/** OpenAPI path definitions, built with a tiny helper to keep them compact. */
const json = (schema) => ({ 'application/json': { schema } });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const str = (extra = {}) => ({ type: 'string', ...extra });
const idParam = { name: 'id', in: 'path', required: true, schema: str() };
const cursorParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
  { name: 'cursor', in: 'query', schema: str() },
];

/**
 * @param {string} tag
 * @param {string} summary
 * @param {{body?: object, auth?: boolean, params?: object[], roles?: string, status?: string}} [o]
 */
const op = (tag, summary, { body, auth = true, params = [], roles, status = '200' } = {}) => ({
  tags: [tag],
  summary: roles ? `${summary} (${roles})` : summary,
  ...(auth ? { security: [{ bearerAuth: [] }] } : {}),
  ...(params.length ? { parameters: params } : {}),
  ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
  responses: {
    [status]: { description: 'Success (envelope: success, message, data, meta)' },
    ...(body ? { 422: { description: 'Validation failed' } } : {}),
    ...(auth ? { 401: { description: 'Unauthenticated' }, 403: { description: 'Forbidden' } } : {}),
    429: { description: 'Rate limited' },
  },
});

const address = obj(
  {
    label: str({ enum: ['home', 'work', 'other'] }),
    name: str(),
    phone: str(),
    line1: str(),
    line2: str(),
    landmark: str(),
    city: str(),
    state: str(),
    pincode: str({ pattern: '^[1-9][0-9]{5}$' }),
    lat: { type: 'number' },
    lng: { type: 'number' },
    isDefault: { type: 'boolean' },
  },
  ['name', 'phone', 'line1', 'city', 'state', 'pincode'],
);
const image = obj({ fileId: str(), url: str(), filePath: str(), thumbnailUrl: str() }, [
  'fileId',
  'url',
  'filePath',
]);

export const paths = {
  '/auth/otp/request': {
    post: op('Auth', 'Send login OTP', { auth: false, body: obj({ phone: str() }, ['phone']) }),
  },
  '/auth/otp/verify': {
    post: op('Auth', 'Verify OTP, login / register; sets httpOnly refresh cookie', {
      auth: false,
      body: obj({ phone: str(), otp: str({ pattern: '^[0-9]{6}$' }), name: str() }, [
        'phone',
        'otp',
      ]),
    }),
  },
  '/auth/login': {
    post: op('Auth', 'Email + password login for admin/staff/rider', {
      auth: false,
      body: obj({ email: str(), password: str() }, ['email', 'password']),
    }),
  },
  '/auth/refresh': {
    post: op('Auth', 'Rotate refresh cookie, get new access token', { auth: false }),
  },
  '/auth/logout': { post: op('Auth', 'Revoke current session', { auth: false }) },

  '/users/me': {
    get: op('Users', 'Current user'),
    patch: op('Users', 'Update own profile', { body: obj({ name: str(), email: str() }) }),
  },
  '/users/me/avatar': { put: op('Users', 'Set avatar from an ImageKit upload', { body: image }) },
  '/users': {
    get: op('Users', 'List users (cursor paginated)', {
      roles: 'admin, staff',
      params: [
        ...cursorParams,
        {
          name: 'role',
          in: 'query',
          schema: str({ enum: ['customer', 'admin', 'staff', 'rider'] }),
        },
        { name: 'search', in: 'query', schema: str() },
        { name: 'isActive', in: 'query', schema: str({ enum: ['true', 'false'] }) },
      ],
    }),
    post: op('Users', 'Create admin/staff/rider', {
      roles: 'admin',
      status: '201',
      body: obj(
        {
          name: str(),
          phone: str(),
          email: str(),
          password: str({ minLength: 10 }),
          role: str({ enum: ['admin', 'staff', 'rider'] }),
        },
        ['name', 'phone', 'email', 'password', 'role'],
      ),
    }),
  },
  '/users/{id}': { get: op('Users', 'Get a user', { roles: 'admin, staff', params: [idParam] }) },
  '/users/{id}/role': {
    patch: op('Users', 'Change role', {
      roles: 'admin',
      params: [idParam],
      body: obj({ role: str() }, ['role']),
    }),
  },
  '/users/{id}/status': {
    patch: op('Users', 'Enable / disable (revokes sessions)', {
      roles: 'admin',
      params: [idParam],
      body: obj({ isActive: { type: 'boolean' } }, ['isActive']),
    }),
  },

  '/addresses': {
    get: op('Addresses', 'List my addresses'),
    post: op('Addresses', 'Add address (max 10)', { body: address, status: '201' }),
  },
  '/addresses/{id}': {
    patch: op('Addresses', 'Update address', {
      params: [idParam],
      body: { ...address, required: [] },
    }),
    delete: op('Addresses', 'Delete address', { params: [idParam] }),
  },
  '/addresses/{id}/default': { put: op('Addresses', 'Make default', { params: [idParam] }) },

  '/uploads/auth': {
    get: op('Uploads', 'Signed ImageKit params for client-side upload (customers: avatars only)', {
      params: [
        {
          name: 'folder',
          in: 'query',
          schema: str({ enum: ['avatars', 'menu', 'banners', 'party', 'misc'] }),
        },
      ],
    }),
  },
  '/uploads/{fileId}': {
    delete: op('Uploads', 'Delete ImageKit file', {
      roles: 'admin',
      params: [{ name: 'fileId', in: 'path', required: true, schema: str() }],
    }),
  },

  '/categories': {
    get: op('Catalog', 'Active categories (cached, public)', { auth: false }),
    post: op('Catalog', 'Create category', {
      roles: 'admin',
      status: '201',
      body: obj({ name: str(), description: str(), image, sortOrder: { type: 'integer' } }, [
        'name',
      ]),
    }),
  },
  '/categories/manage': {
    get: op('Catalog', 'All categories (cursor)', { roles: 'admin, staff', params: cursorParams }),
  },
  '/categories/{id}': {
    patch: op('Catalog', 'Update category', {
      roles: 'admin',
      params: [idParam],
      body: obj({ name: str(), isActive: { type: 'boolean' } }),
    }),
    delete: op('Catalog', 'Soft-delete (409 if active items exist)', {
      roles: 'admin',
      params: [idParam],
    }),
  },
  '/menu-items': {
    get: op('Catalog', 'Public menu (cached). Prices in paise', {
      auth: false,
      params: [
        { name: 'category', in: 'query', schema: str() },
        { name: 'veg', in: 'query', schema: str({ enum: ['true', 'false'] }) },
        { name: 'available', in: 'query', schema: str({ enum: ['true', 'false'] }) },
        {
          name: 'q',
          in: 'query',
          description: 'Text search (max 50 results, uncached)',
          schema: str(),
        },
      ],
    }),
    post: op('Catalog', 'Create menu item', {
      roles: 'admin',
      status: '201',
      body: obj(
        {
          name: str(),
          categoryId: str(),
          isVeg: { type: 'boolean' },
          price: { type: 'integer', description: 'paise' },
          mrp: { type: 'integer' },
          image,
          variants: {
            type: 'array',
            maxItems: 10,
            items: obj({ name: str(), price: { type: 'integer' } }),
          },
          addOns: {
            type: 'array',
            maxItems: 20,
            items: obj({ name: str(), price: { type: 'integer' }, isVeg: { type: 'boolean' } }),
          },
        },
        ['name', 'categoryId', 'isVeg', 'price'],
      ),
    }),
  },
  '/menu-items/manage': {
    get: op('Catalog', 'All items incl. inactive (cursor)', {
      roles: 'admin, staff',
      params: cursorParams,
    }),
  },
  '/menu-items/{idOrSlug}': {
    get: op('Catalog', 'Item detail by id or slug (cached)', {
      auth: false,
      params: [{ name: 'idOrSlug', in: 'path', required: true, schema: str() }],
    }),
  },
  '/menu-items/{id}': {
    patch: op('Catalog', 'Update item', {
      roles: 'admin',
      params: [idParam],
      body: obj({ price: { type: 'integer' } }),
    }),
    delete: op('Catalog', 'Soft-delete item', { roles: 'admin', params: [idParam] }),
  },
  '/menu-items/{id}/availability': {
    patch: op('Catalog', 'Stock on/off', {
      roles: 'admin, staff',
      params: [idParam],
      body: obj({ isAvailable: { type: 'boolean' } }, ['isAvailable']),
    }),
  },
  '/banners': {
    get: op('Catalog', 'Live banners (schedule applied at serve time)', {
      auth: false,
      params: [
        {
          name: 'position',
          in: 'query',
          schema: str({ enum: ['home_hero', 'home_secondary', 'menu', 'party'] }),
        },
      ],
    }),
    post: op('Catalog', 'Create banner', {
      roles: 'admin',
      status: '201',
      body: obj(
        {
          title: str(),
          image,
          position: str(),
          startsAt: str({ format: 'date-time' }),
          endsAt: str({ format: 'date-time' }),
        },
        ['title', 'image'],
      ),
    }),
  },
  '/banners/manage': {
    get: op('Catalog', 'All banners (cursor)', { roles: 'admin, staff', params: cursorParams }),
  },
  '/banners/{id}': {
    patch: op('Catalog', 'Update banner', {
      roles: 'admin',
      params: [idParam],
      body: obj({ title: str() }),
    }),
    delete: op('Catalog', 'Delete banner', { roles: 'admin', params: [idParam] }),
  },
  '/delivery-zones': {
    get: op('Delivery', 'Coverage list (cached)', { auth: false }),
    post: op('Delivery', 'Create zone (pincode or distance)', {
      roles: 'admin',
      status: '201',
      body: obj(
        {
          name: str(),
          kind: str({ enum: ['pincode', 'distance'] }),
          pincodes: { type: 'array', items: str() },
          minKm: { type: 'number' },
          maxKm: { type: 'number' },
          deliveryCharge: { type: 'integer' },
          freeDeliveryAbove: { type: 'integer' },
        },
        ['name', 'kind', 'deliveryCharge'],
      ),
    }),
  },
  '/delivery-zones/quote': {
    post: op('Delivery', 'Delivery charge for a pincode or lat/lng (422 if not serviceable)', {
      auth: false,
      body: obj(
        {
          pincode: str(),
          lat: { type: 'number' },
          lng: { type: 'number' },
          subtotal: { type: 'integer' },
        },
        ['subtotal'],
      ),
    }),
  },
  '/delivery-zones/manage': { get: op('Delivery', 'All zones', { roles: 'admin, staff' }) },
  '/delivery-zones/{id}': {
    patch: op('Delivery', 'Update zone', {
      roles: 'admin',
      params: [idParam],
      body: obj({ deliveryCharge: { type: 'integer' } }),
    }),
    delete: op('Delivery', 'Deactivate zone', { roles: 'admin', params: [idParam] }),
  },
  '/coupons': {
    get: op('Coupons', 'Public live offers (cached)', { auth: false }),
    post: op('Coupons', 'Create coupon', {
      roles: 'admin',
      status: '201',
      body: obj(
        {
          code: str(),
          type: str({ enum: ['percent', 'flat'] }),
          value: { type: 'integer' },
          maxDiscount: { type: 'integer' },
          minOrderAmount: { type: 'integer' },
          startsAt: str({ format: 'date-time' }),
          expiresAt: str({ format: 'date-time' }),
          usageLimit: { type: 'integer' },
          perUserLimit: { type: 'integer' },
          isPublic: { type: 'boolean' },
        },
        ['code', 'type', 'value'],
      ),
    }),
  },
  '/coupons/validate': {
    post: op('Coupons', 'Check a code against a cart subtotal (paise)', {
      body: obj({ code: str(), subtotal: { type: 'integer' } }, ['code', 'subtotal']),
    }),
  },
  '/coupons/manage': {
    get: op('Coupons', 'All coupons (cursor)', { roles: 'admin', params: cursorParams }),
  },
  '/coupons/{id}': {
    patch: op('Coupons', 'Update coupon', {
      roles: 'admin',
      params: [idParam],
      body: obj({ isActive: { type: 'boolean' } }),
    }),
    delete: op('Coupons', 'Deactivate coupon', { roles: 'admin', params: [idParam] }),
  },

  '/cart': {
    get: op('Cart', 'My priced cart (prices from current menu)'),
    delete: op('Cart', 'Clear cart'),
  },
  '/cart/items': {
    post: op('Cart', 'Add item (merges identical lines atomically)', {
      body: obj(
        {
          menuItemId: str(),
          variantId: str(),
          addOnIds: { type: 'array', items: str() },
          quantity: { type: 'integer', minimum: 1, maximum: 20 },
          note: str(),
        },
        ['menuItemId'],
      ),
    }),
  },
  '/cart/items/{lineId}': {
    patch: op('Cart', 'Set quantity (0 removes)', {
      params: [{ name: 'lineId', in: 'path', required: true, schema: str() }],
      body: obj({ quantity: { type: 'integer' } }, ['quantity']),
    }),
    delete: op('Cart', 'Remove line', {
      params: [{ name: 'lineId', in: 'path', required: true, schema: str() }],
    }),
  },
  '/cart/coupon': {
    put: op('Cart', 'Apply coupon', { body: obj({ code: str() }, ['code']) }),
    delete: op('Cart', 'Remove coupon'),
  },
  '/orders/preview': {
    post: op('Orders', 'Checkout totals (no side effects)', {
      body: obj({ type: str({ enum: ['delivery', 'pickup'] }), addressId: str() }),
    }),
  },
  '/orders': {
    get: op('Orders', 'My orders (cursor)', { params: cursorParams }),
    post: op(
      'Orders',
      'Place order from cart. Requires Idempotency-Key header; totals are recomputed server-side',
      {
        status: '201',
        params: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: str({ minLength: 8, maxLength: 80 }),
          },
        ],
        body: obj(
          {
            type: str({ enum: ['delivery', 'pickup'] }),
            addressId: str(),
            paymentMethod: str({ enum: ['online', 'cod'] }),
            note: str(),
          },
          ['paymentMethod'],
        ),
      },
    ),
  },
  '/orders/manage': {
    get: op('Orders', 'Live board / history', {
      roles: 'admin, staff',
      params: [
        ...cursorParams,
        { name: 'status', in: 'query', description: 'comma separated', schema: str() },
        { name: 'active', in: 'query', schema: str({ enum: ['true', 'false'] }) },
        { name: 'includeUnpaid', in: 'query', schema: str({ enum: ['true', 'false'] }) },
      ],
    }),
  },
  '/orders/rider/mine': { get: op('Orders', 'My active deliveries', { roles: 'rider' }) },
  '/orders/{id}': {
    get: op('Orders', 'Order detail (owner, staff, assigned rider)', { params: [idParam] }),
  },
  '/orders/{id}/cancel': {
    post: op('Orders', 'Customer cancel (only while PLACED)', {
      params: [idParam],
      body: obj({ reason: str() }),
    }),
  },
  '/orders/{id}/status': {
    patch: op(
      'Orders',
      'State machine transition: PLACED>ACCEPTED>PREPARING>READY>OUT_FOR_DELIVERY>DELIVERED (+CANCELLED, REJECTED)',
      {
        roles: 'admin, staff, rider(DELIVERED only)',
        params: [idParam],
        body: obj(
          {
            status: str({
              enum: [
                'ACCEPTED',
                'PREPARING',
                'READY',
                'OUT_FOR_DELIVERY',
                'DELIVERED',
                'CANCELLED',
                'REJECTED',
              ],
            }),
            note: str(),
          },
          ['status'],
        ),
      },
    ),
  },
  '/orders/{id}/assign': {
    patch: op('Orders', 'Assign rider', {
      roles: 'admin, staff',
      params: [idParam],
      body: obj({ riderId: str() }, ['riderId']),
    }),
  },
  '/payments/razorpay/order': {
    post: op('Payments', 'Create / reuse the Razorpay order for an unpaid online order', {
      body: obj({ orderId: str() }, ['orderId']),
    }),
  },
  '/payments/razorpay/verify': {
    post: op('Payments', 'Verify checkout signature (idempotent)', {
      body: obj(
        { razorpay_order_id: str(), razorpay_payment_id: str(), razorpay_signature: str() },
        ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
      ),
    }),
  },
  '/payments/razorpay/webhook': {
    post: {
      tags: ['Payments'],
      summary:
        'Razorpay webhook (HMAC-verified raw body, idempotent by event id). Events: payment.captured, order.paid, payment.failed, refund.processed',
      parameters: [
        { name: 'X-Razorpay-Signature', in: 'header', required: true, schema: str() },
        { name: 'X-Razorpay-Event-Id', in: 'header', schema: str() },
      ],
      responses: {
        200: { description: 'Processed or duplicate' },
        401: { description: 'Bad signature' },
      },
    },
  },
  '/notifications': { get: op('Notifications', 'Inbox (cursor)', { params: cursorParams }) },
  '/notifications/unread-count': { get: op('Notifications', 'Unread badge count') },
  '/notifications/read': {
    post: op('Notifications', 'Mark read (ids or all)', {
      body: obj({ ids: { type: 'array', items: str() } }),
    }),
  },
};
