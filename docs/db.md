# Database Design

> **Phase 0:** no collections exist yet. This file is the living schema reference; each phase adds its collections (fields, indexes + the query each serves, enums, examples, caching, sizing).

## Conventions

- MongoDB replica set (transactions for booking/payment flows). Mongoose with `strictQuery`, `autoIndex` only in dev/test; production builds indexes explicitly.
- Money stored as integer **paise**. Timestamps `createdAt/updatedAt` on all collections. Soft delete via `isActive`/`deletedAt` where history matters.
- Reads use `.lean()` + explicit projection; lists use **cursor pagination** (`_id`/sort key), never deep `skip`.
- No unbounded arrays inside documents (order items are bounded; status history is capped; messages/reviews/events live in their own collections).
- Temporary data uses TTL indexes (booking holds, OTP backups, idempotency keys).

## Planned collections (by phase)

| Phase | Collections                                                       |
| ----- | ----------------------------------------------------------------- |
| 1     | `users`, `refreshtokens`, `addresses`                             |
| 2     | `categories`, `menuitems`, `banners`, `deliveryzones`, `coupons`  |
| 3     | `carts`, `orders`, `payments`, `notifications`, `idempotencykeys` |
| 5     | `tables`, `timeslots`, `tablebookings`                            |
| 6     | `partypackages`, `partyinquiries`                                 |
| 7/8   | `reviews`, `analyticsrollups`                                     |

## Sharding & archiving strategy (preview; detailed per collection later)

- Shard only when a single replica set can't hold the working set (see `scaling.md`).
- Candidate keys: `orders` → `{ userId: "hashed" }` (even write spread; user history is single-shard) or `{ createdAt }` ranges with zones for archival; `notifications`/`reviews` → `{ userId: "hashed" }`; `users` → `{ _id: "hashed" }`. Catalog collections are small and stay unsharded.
- Archive delivered/cancelled orders older than N months to cold storage (`orders_archive`/object storage) via a BullMQ job.
