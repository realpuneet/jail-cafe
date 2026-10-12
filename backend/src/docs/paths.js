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
};
