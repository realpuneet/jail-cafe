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

Peak load is bursty (lunch/dinner); size for the burst and autoscale on CPU + event-loop lag. A load-test script (k6/autocannon) is added in Phase 8.
