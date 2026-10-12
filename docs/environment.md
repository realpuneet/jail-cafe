# Environment Variables

Backend vars are validated by Zod in `backend/src/config/env.js`; the process exits listing every invalid variable. Templates: `backend/.env.example`, `frontend/.env.example`. `.env` files are git-ignored.

## Backend

| Variable                                                                 | Req                | Example                                             | Used by                                        | Where to get it / notes                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------ | --------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                               | no (`development`) | `production`                                        | everything                                     | Prod enables https-only origins, hides stacks, disables mongoose autoIndex                                                               |
| `PORT`                                                                   | no (5000)          | `5000`                                              | HTTP server                                    |                                                                                                                                          |
| `API_PREFIX`                                                             | no                 | `/api/v1`                                           | router                                         | Keep versioned                                                                                                                           |
| `CLIENT_URLS`                                                            | **yes**            | `https://jailkichai.in,https://admin.jailkichai.in` | CORS, Socket.io                                | Exact origins, comma-separated; https in prod                                                                                            |
| `TRUST_PROXY`                                                            | no (1)             | `1`                                                 | express                                        | Number of proxies in front (needed for real IPs and secure cookies)                                                                      |
| `LOG_LEVEL`                                                              | no (info)          | `info`                                              | Pino                                           | `silent` in tests                                                                                                                        |
| `BODY_LIMIT`                                                             | no (100kb)         | `100kb`                                             | body parsers                                   |                                                                                                                                          |
| `SENTRY_DSN`                                                             | no                 | `https://…@sentry.io/1`                             | error hook                                     | Sentry project settings                                                                                                                  |
| `MONGO_URI`                                                              | **yes**            | `mongodb+srv://u:p@cluster.mongodb.net`             | Mongoose                                       | Atlas → Connect. Must be a replica set (transactions)                                                                                    |
| `MONGO_DB_NAME`                                                          | no                 | `jailkichai`                                        | Mongoose                                       |                                                                                                                                          |
| `MONGO_MAX_POOL_SIZE`                                                    | no (50)            | `50`                                                | Mongoose                                       | Per instance; total = instances × pool, mind Atlas connection limits                                                                     |
| `MONGO_READ_PREFERENCE`                                                  | no (primary)       | `secondaryPreferred`                                | Mongoose                                       | Only after read replicas exist                                                                                                           |
| `REDIS_URL`                                                              | **yes**            | `rediss://default:pw@host:6379`                     | cache, rate limit, OTP, BullMQ, Socket adapter | Upstash/Redis Cloud/self-host. Use `rediss://` in prod. Queues need `noeviction` policy                                                  |
| `REDIS_KEY_PREFIX`                                                       | no                 | `jkc:`                                              | all keys                                       | Change per environment sharing one Redis                                                                                                 |
| `JWT_ACCESS_SECRET`                                                      | **yes**            | 96 hex chars                                        | auth                                           | ≥32 chars, different from refresh                                                                                                        |
| `JWT_REFRESH_SECRET`                                                     | **yes**            | 96 hex chars                                        | auth                                           | Rotating invalidates all sessions                                                                                                        |
| `JWT_ACCESS_EXPIRES`                                                     | no (15m)           | `15m`                                               | auth                                           |                                                                                                                                          |
| `JWT_REFRESH_EXPIRES`                                                    | no (30d)           | `30d`                                               | auth                                           |                                                                                                                                          |
| `COOKIE_DOMAIN`                                                          | no                 | `.jailkichai.in`                                    | refresh cookie                                 | Empty on localhost                                                                                                                       |
| `OTP_EXPIRES_SECONDS`                                                    | no (300)           | `300`                                               | OTP                                            |                                                                                                                                          |
| `OTP_MAX_ATTEMPTS`                                                       | no (5)             | `5`                                                 | OTP lockout                                    |                                                                                                                                          |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | Phase 1+           | `https://ik.imagekit.io/<id>`                       | uploads                                        | ImageKit dashboard → Developer options. Private key is server-only                                                                       |
| `IMAGEKIT_FOLDER`                                                        | no                 | `/jailkichai`                                       | uploads                                        |                                                                                                                                          |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`                                | Phase 3+           | `rzp_test_…`                                        | payments                                       | Razorpay dashboard → API keys (test vs live)                                                                                             |
| `RAZORPAY_WEBHOOK_SECRET`                                                | Phase 3+           | random                                              | webhook verify                                 | You choose it when creating the webhook                                                                                                  |
| `SMS_API_KEY` / `SMS_TEMPLATE_ID`                                        | prod               |                                                     | OTP SMS (MSG91 OTP API)                        | MSG91 dashboard → auth key + OTP template id. In dev without them the OTP is logged at debug level; in production sending fails with 503 |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`                               | for `npm run seed` |                                                     | seed script                                    | Password ≥10 chars; remove after seeding                                                                                                 |
| `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `SMTP_*`, `MAIL_FROM`          | Phase 3+           |                                                     | notification workers                           | Provider dashboards; dev can leave empty (jobs log instead of send)                                                                      |
| `RATE_LIMIT_WINDOW_MS`                                                   | no (900000)        |                                                     | rate limiter                                   |                                                                                                                                          |
| `RATE_LIMIT_MAX`                                                         | no (300)           |                                                     | global limiter                                 | Per IP per window                                                                                                                        |
| `AUTH_RATE_LIMIT_MAX`                                                    | no (10)            |                                                     | auth limiter                                   |                                                                                                                                          |
| `CAFE_NAME`, `DEFAULT_DELIVERY_RADIUS_KM`, `MIN_ORDER_AMOUNT`            | no                 |                                                     | business rules                                 |                                                                                                                                          |

## Frontend (public — never put secrets here)

| Variable                                                 | Example                            | Notes           |
| -------------------------------------------------------- | ---------------------------------- | --------------- |
| `VITE_API_BASE_URL`                                      | `https://api.jailkichai.in/api/v1` |                 |
| `VITE_SOCKET_URL`                                        | `https://api.jailkichai.in`        |                 |
| `VITE_IMAGEKIT_URL_ENDPOINT`, `VITE_IMAGEKIT_PUBLIC_KEY` |                                    | Public key only |
| `VITE_RAZORPAY_KEY_ID`                                   | `rzp_live_…`                       | Key id only     |
| `VITE_APP_NAME`                                          | `Jail Ki Chai`                     |                 |

## Generating secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run twice: once for access, once for refresh. Use a secret manager in production.

## Service setup

- **MongoDB Atlas**: create a cluster (replica set by default), a DB user, allow-list the API egress IPs, copy the SRV URI to `MONGO_URI`.
- **Redis**: managed instance with persistence; set `maxmemory-policy noeviction` (BullMQ). Use TLS (`rediss://`).
- **ImageKit**: dashboard → Developer options → copy Public key, Private key, URL endpoint into `IMAGEKIT_*`. The browser calls `GET /api/v1/uploads/auth?folder=avatars|menu|banners|party|misc` (JWT required; customers only get `avatars`) and uploads straight to ImageKit with the returned `token/expire/signature/publicKey`, then sends `{fileId,url,filePath,thumbnailUrl}` to the API. The API accepts only URLs under `IMAGEKIT_URL_ENDPOINT`. Private key never leaves the server.
- **Razorpay**: configured in Phase 3 (webhook URL `https://<api>/api/v1/payments/webhook`, events `payment.captured`, `payment.failed`, `refund.processed`); this section is expanded then.
- **CORS & cookies (prod)**: `CLIENT_URLS` must list exact https origins. Refresh cookie: `httpOnly; Secure; SameSite=Lax` (use `None` only if the API is on a different site, plus `COOKIE_DOMAIN`). Set `TRUST_PROXY` so `Secure` works behind the LB.

## Production checklist

- [ ] `NODE_ENV=production`, secrets from a secret manager, distinct access/refresh secrets
- [ ] Mongo replica set with backups; indexes built (`autoIndex` is off in prod)
- [ ] Redis TLS + persistence + `noeviction`
- [ ] HTTPS origins only; correct `TRUST_PROXY`
- [ ] LB health check → `/health`, readiness → `/ready`; sticky sessions for Socket.io
- [ ] Razorpay live keys + webhook secret configured
- [ ] Log shipping and error tracking (Sentry DSN)
