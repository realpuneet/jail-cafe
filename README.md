# Jail Ki Chai — Cafe Platform

Food ordering + table booking + party booking + admin/staff/rider panels for the cafe **Jail Ki Chai**, built to scale to 1 Cr+ registered users.

> **Status:** Phase 0–3 complete (scaffold, auth, catalog + caching, cart/orders/payments/realtime/notifications). See [Roadmap](#roadmap).

## Features (target)

- **Food ordering**: menu with categories, veg/non-veg, add-ons, variants; cart; coupons; pincode/distance delivery charge; live tracking.
- **Table booking**: date / slot / guests, concurrency-safe capacity, optional deposit, reminders.
- **Party booking**: packages, inquiry → admin quote → accept → token payment → confirmed.
- **Panels**: admin, staff, rider (RBAC: `customer | admin | staff | rider`).

## Architecture

```mermaid
flowchart LR
  C[React PWA] -->|HTTPS /api/v1| LB[Load balancer / Nginx]
  C -->|WebSocket| LB
  LB --> A1[API instance 1]
  LB --> A2[API instance N]
  A1 & A2 --> M[(MongoDB replica set)]
  A1 & A2 --> R[(Redis: cache, rate limit, OTP, pub/sub)]
  A1 & A2 -->|enqueue| Q[[BullMQ queues in Redis]]
  W[Workers] --> Q
  W --> N[WhatsApp / SMS / Email]
  A1 & A2 --> RZ[Razorpay] & IK[ImageKit]
```

Request flow: `route → validator → middleware → controller → service → model/integration`. Controllers are thin; all business logic is in services; services never touch `req/res`.

## Tech stack

Backend: Node.js 20+, Express 4, MongoDB (Mongoose), Redis (ioredis), BullMQ, Socket.io, Zod, JWT, Razorpay, ImageKit, Pino, Helmet, express-rate-limit (Redis store), Jest + Supertest.
Frontend (Phase 4): React + Vite, Tailwind, React Router, TanStack Query, Zustand, GSAP, Lenis, PWA.
DevOps: Docker, docker-compose, PM2 cluster, GitHub Actions, ESLint + Prettier + Husky + lint-staged.

> Express 4 is deliberate: `express-mongo-sanitize` is not compatible with Express 5's read-only `req.query`.

## Folder structure

```
backend/   src/{config,models,routes,controllers,services,repositories,middlewares,validators,jobs,sockets,utils,integrations,docs}, tests/
frontend/  (Phase 4)
docs/      db.md, environment.md, scaling.md
docker-compose.yml   .github/workflows/ci.yml
```

## Prerequisites

Node 20+ (22 recommended), MongoDB 6+/7 **as a replica set** (transactions), Redis 6+, Docker (optional).

## Setup

### Docker (everything)

```bash
docker compose up --build        # api :5000, mongo :27017 (replica set rs0), redis :6379
curl localhost:5000/ready
```

### Local

```bash
npm install                      # root: husky + lint-staged + prettier
cd backend && npm install
cp .env.example .env             # fill MONGO_URI, REDIS_URL, JWT secrets (see docs/environment.md)
npm run dev
```

Infra only: `docker compose up mongo redis`, then use `MONGO_URI=mongodb://localhost:27017/?replicaSet=rs0` and `REDIS_URL=redis://localhost:6379`.

## Scripts (backend)

| Script                      | What it does                           |
| --------------------------- | -------------------------------------- |
| `npm run dev`               | Start with `node --watch`              |
| `npm start`                 | Production start (single process)      |
| `npm run start:pm2`         | PM2 cluster via `ecosystem.config.cjs` |
| `npm run lint` / `lint:fix` | ESLint                                 |
| `npm test`                  | Jest + Supertest                       |

Seed (`npm run seed`) and the frontend scripts arrive in later phases.

## API

- Swagger UI: `http://localhost:5000/api/docs` (JSON: `/api/docs.json`)
- Auth: `POST /auth/otp/request` → `/auth/otp/verify` (access token in body, rotating refresh token in an httpOnly cookie) · `/auth/refresh` · `/auth/logout` · `/auth/login` (admin/staff/rider email+password)
- `GET/PATCH /users/me`, `PUT /users/me/avatar`; admin: `GET/POST /users`, `PATCH /users/:id/role|status`
- `/addresses` CRUD + `PUT /addresses/:id/default`; `GET /uploads/auth` (ImageKit signature)
- Catalog (public, cached): `GET /categories`, `GET /menu-items?category&veg&available&q`, `GET /menu-items/:idOrSlug`, `GET /banners?position`, `GET /delivery-zones`, `POST /delivery-zones/quote`, `GET /coupons`; `POST /coupons/validate` (auth). Admin/staff write endpoints and `/…/manage` lists are documented in Swagger. **All prices are integer paise.**
- Cart `/cart…` (server-priced, atomic) · `POST /orders/preview`, `POST /orders` (**requires `Idempotency-Key`**), `GET /orders`, `POST /orders/:id/cancel` · staff `GET /orders/manage`, `PATCH /orders/:id/status|assign` · rider `GET /orders/rider/mine`
- Payments: `POST /payments/razorpay/order` → Razorpay Checkout → `POST /payments/razorpay/verify`; `POST /payments/razorpay/webhook` (signature + idempotency). COD supported.
- `GET /notifications`, `/notifications/unread-count`, `POST /notifications/read`
- **Realtime (Socket.io, same origin as the API)** – connect with `auth: { token: <access token> }`. Client → server: `order:subscribe {orderId}` (ack returns status + last rider location), `rider:location {orderId,lat,lng}` (riders). Server → client: `order:new` (staff room; play the alert sound), `order:status`, `order:payment`, `order:location`, `notification:new`.
- Probes: `GET /health` (liveness), `GET /ready` (Mongo + Redis; 503 while shutting down)
- Response envelope: `{ success, message, data, meta }`; errors: `{ success:false, message, code, details, requestId }`

## Testing

`cd backend && npm test`. Integration tests start an in-memory MongoDB **replica set** via `mongodb-memory-server` (first run downloads a `mongod` binary; set `MONGOMS_SYSTEM_BINARY=/path/to/mongod` to use a local one) and a fake Redis. The BullMQ suite (`tests/integration/queue.test.js`) needs a real Redis: it runs when `CI=true` or `RUN_REDIS_TESTS=1` (uses `REDIS_TEST_URL`, default `redis://127.0.0.1:6379`) and is skipped otherwise.

## Deployment (summary)

- **VPS**: Docker compose or PM2 behind Nginx with sticky sessions for Socket.io; managed MongoDB Atlas + Redis.
- **Render/Railway**: deploy `backend/` as a Docker web service, set env vars from `docs/environment.md`.
- **Vercel/Netlify**: frontend (Phase 4).
  Full checklist: [docs/environment.md](docs/environment.md#production-checklist).

## Scaling

See [docs/scaling.md](docs/scaling.md) and [docs/db.md](docs/db.md).

## Contributing / code style

Prettier + ESLint enforced by a Husky pre-commit (lint-staged). Enums/constants live in `utils/constants.js`. JSDoc on service methods. No business logic in controllers. Conventional, descriptive commits.

## Troubleshooting

| Symptom                                            | Fix                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| App exits with `Invalid environment configuration` | Fill the listed vars in `backend/.env`                                         |
| `/ready` returns 503                               | Check `data.checks` to see whether `mongo` or `redis` is down                  |
| Mongo transactions error `replica set`             | Run Mongo as a replica set (`--replSet rs0`, `rs.initiate`); compose does this |
| CORS blocked in browser                            | Add the exact origin (no trailing slash) to `CLIENT_URLS`                      |

## Roadmap

- [x] **Phase 0** scaffold, config, errors, logging, probes, Docker, CI
- [x] **Phase 1** auth (OTP, JWT rotation + reuse detection, RBAC), users, addresses, ImageKit uploads
- [x] **Phase 2** categories, menu items (variants/add-ons/stock toggle), banners, delivery zones, coupons + versioned Redis cache
- [ ] Phase 4 frontend foundation · Phase 5 table booking · Phase 6 party booking · Phase 7 admin · Phase 8 perf/security/docs
