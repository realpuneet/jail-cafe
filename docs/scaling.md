# Scaling Notes

## Architecture principles (in place from Phase 0)

- **Stateless API**: no in-memory sessions; all shared state in Redis/Mongo → run N instances (PM2 cluster / containers) behind a load balancer.
- **Redis-backed rate limiting** works across instances (`rate-limit-redis`).
- **Readiness-aware shutdown**: SIGTERM flips `/ready` to 503, drains in-flight requests, then closes Mongo/Redis (queues/sockets join in later phases).
- **Queues for slow work** (notifications, PDFs, rollups) so API latency stays flat — Phase 3.
- **Socket.io** uses the Redis adapter (Phase 3); the LB needs sticky sessions (or websocket-only transport).

## Bottlenecks & what to do

| Scale        | Registered users | Likely bottleneck                                     | Action                                                                                                                                                                      |
| ------------ | ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now          | up to ~10 L      | Single Mongo primary reads of menu                    | Redis cache menu/categories/banners/zones/coupons; indexes for every query                                                                                                  |
| 10 L → 50 L  |                  | Read load on primary; connection count                | Read replicas (`MONGO_READ_PREFERENCE=secondaryPreferred` for non-critical reads), CDN for images and public GETs, tune pool sizes, split workers into their own deployment |
| 50 L → 1 Cr+ |                  | Orders/notifications write volume and collection size | Shard `orders`/`notifications` (see `db.md`), archive old orders, separate services (orders, notifications, realtime), dedicated Redis for queues vs cache                  |

Peak load is bursty (lunch/dinner); size for the burst and autoscale on CPU + event-loop lag. A load-test script (k6/autocannon) is added in Phase 8.
