# Scaling Notes

## Architecture principles (in place from Phase 0)

- **Stateless API**: no in-memory sessions; all shared state in Redis/Mongo → run N instances (PM2 cluster / containers) behind a load balancer.
- **Redis-backed rate limiting** works across instances (`rate-limit-redis`).
- **Readiness-aware shutdown**: SIGTERM flips `/ready` to 503, drains in-flight requests, then closes Mongo/Redis (queues/sockets join in later phases).
- **Queues for slow work** (BullMQ on Redis): notifications (in-app + socket push + WhatsApp/email), refunds and maintenance run in workers with exponential-backoff retries (5 attempts) and a dead-letter queue (`notifications-dlq`). API handlers only enqueue. `RUN_WORKERS=false` + `npm run worker` splits workers into their own deployment; they are safe to run as many replicas.
- **Socket.io** uses the Redis adapter, so rooms (`user:<id>`, `order:<id>`, `staff`, `riders`) work across instances; workers/other processes publish through the Redis emitter. **Load balancer: enable sticky sessions** (cookie/IP hash) for the long-polling handshake, or force `transports: ['websocket']` on the client and skip stickiness. Rider location is throttled (1 fix / 2 s per socket), authorised once per 30 s per order, and the last fix is cached in Redis.
- **Idempotency**: `Idempotency-Key` on order creation and gateway-order creation (Redis, 24 h) plus a unique `(userId, idempotencyKey)` index as a backstop; webhooks are de-duplicated by event id.

## Bottlenecks & what to do

| Scale        | Registered users | Likely bottleneck                                     | Action                                                                                                                                                                      |
| ------------ | ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now          | up to ~10 L      | Single Mongo primary reads of menu                    | Redis cache menu/categories/banners/zones/coupons; indexes for every query                                                                                                  |
| 10 L → 50 L  |                  | Read load on primary; connection count                | Read replicas (`MONGO_READ_PREFERENCE=secondaryPreferred` for non-critical reads), CDN for images and public GETs, tune pool sizes, split workers into their own deployment |
| 50 L → 1 Cr+ |                  | Orders/notifications write volume and collection size | Shard `orders`/`notifications` (see `db.md`), archive old orders, separate services (orders, notifications, realtime), dedicated Redis for queues vs cache                  |

Peak load is bursty (lunch/dinner); size for the burst and autoscale on CPU + event-loop lag. Load-test script: `node backend/scripts/loadtest.mjs [baseUrl] [seconds] [connections]` (autocannon).

## Measured load test (read path)

Single Node process (no cluster), seeded data, Redis cache warm, `RATE_LIMIT_MAX` raised so the limiter did not interfere, 100 connections for 8 s each. **The load generator, API, MongoDB and Redis shared one small sandbox VM**, so treat the absolute numbers as a floor, not a capacity claim.

| Endpoint                      | req/s | p50 ms | p97.5 ms | p99 ms | non-2xx / errors |
| ----------------------------- | ----- | ------ | -------- | ------ | ---------------- |
| `/health`                     | ~3.7k | 24     | 46       | 49     | 0 / 0            |
| `/api/v1/menu-items?limit=20` | ~2.2k | 44     | 65       | 97     | 0 / 0            |
| `/api/v1/categories`          | ~2.7k | 33     | 59       | 67     | 0 / 0            |
| `/api/v1/banners`             | ~2.7k | 33     | 59       | 63     | 0 / 0            |
| `/booking-slots/availability` | ~0.9k | 104    | 153      | 256    | 0 / 0            |

Takeaways: cached public reads stay in the low-millisecond service time range and scale linearly with extra processes (PM2 cluster / more replicas); availability is the slowest because it combines two Mongo reads and a per-day computation with only a 5 s edge cache. With the default limiter (300 req / 15 min / IP) the same test returns `429` almost immediately, which confirms the limiter works. Writes (orders, bookings) were validated for correctness under concurrency by the integration tests (no oversell, no double refund) rather than by raw throughput; run your own write-path test against staging before launch.

## Table booking at scale

Seat counts live in one tiny document per (slot, day), updated with a single atomic conditional `$inc`, so there is no lock, no read-modify-write loop and no cross-document coordination: contention only exists between requests for the _same_ slot and day. If one hot slot (e.g. Saturday dinner) ever becomes a bottleneck, split its capacity into N sub-counters (`slotId`, `date`, `bucket`) and try buckets in random order; the API and data model stay the same. Holds are released by a per-minute maintenance job (bounded to 200 per run, safe to run on every worker replica because each release is a compare-and-set).

## Frontend performance (Lighthouse, mobile emulation, local preview build)

Measured against `vite preview` with **no API running** and no CDN/HTTP2, so LCP/FCP are pessimistic: Performance 82, Accessibility 96 → fixed (`aria-label` on a plain `span` in `SplitText`; now a visually hidden text node), Best-practices 96 (remaining item was only the refused API calls), SEO 91 → fixed (`robots.txt` added). CLS 0, TBT 40 ms, LCP 3.6 s on throttled 4G/CPU. Initial JS is split into react (79 kB gz), motion (50 kB gz) and per-route lazy chunks; admin, booking, party and charts are not in the first load. Re-run on your deployed URL (with CDN and gzip/brotli) before launch.
