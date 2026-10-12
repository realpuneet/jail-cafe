# Database Design

> Living schema reference; each phase adds its collections (fields, indexes + the query each serves, enums, examples, caching, sizing). **Implemented so far: Phase 1** (`users`, `refreshtokens`, `addresses`) and **Phase 2** (`categories`, `menuitems`, `banners`, `deliveryzones`, `coupons`, `couponredemptions`, `couponusages`). All money fields are integer **paise**.

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

## Phase 1 collections

### `users`

Purpose: every account (customer via OTP; admin/staff/rider via email+password).

| Field                                   | Type                               | Req | Default    | Notes                                                      |
| --------------------------------------- | ---------------------------------- | --- | ---------- | ---------------------------------------------------------- |
| `phone`                                 | String                             | yes |            | E.164 `+91XXXXXXXXXX`, unique                              |
| `name`                                  | String(≤80)                        | no  | `""`       |                                                            |
| `email`                                 | String(≤120)                       | no  |            | lowercase; unique only when present                        |
| `passwordHash`                          | String                             | no  |            | argon2id, `select:false`; staff roles only                 |
| `role`                                  | enum                               | no  | `customer` | `customer \| admin \| staff \| rider`                      |
| `isActive`                              | Boolean                            | no  | `true`     | false => login refused, live tokens blocked via Redis flag |
| `avatar`                                | {fileId,url,filePath,thumbnailUrl} | no  |            | ImageKit; only these fields are stored                     |
| `lastLoginAt`, `createdAt`, `updatedAt` | Date                               |     |            |                                                            |

Indexes: `{phone:1}` unique (OTP login/upsert) · `{email:1}` unique, partial `email $type string` (staff login) · `{role:1,_id:-1}` (admin list by role, cursor pagination).
Size ≈ 400 B/doc; 1 Cr users ≈ 4 GB + indexes. Growth: one doc per registered user. Cache: none (profile read is by `_id`); block flag `jkc:blocked:<userId>` in Redis.
Example: `{ "_id": "65f…", "phone": "+919876543210", "name": "Puneet", "role": "customer", "isActive": true }`

### `refreshtokens`

Purpose: server-side record of each refresh JWT to support rotation, reuse detection and revocation.

| Field             | Type           | Req | Notes                                                                    |
| ----------------- | -------------- | --- | ------------------------------------------------------------------------ |
| `jti`             | String         | yes | unique id of this token                                                  |
| `family`          | String         | yes | one per login session; reuse of a rotated token revokes the whole family |
| `userId`          | ObjectId→users | yes |                                                                          |
| `expiresAt`       | Date           | yes | TTL                                                                      |
| `revokedAt`       | Date           | no  | set atomically on rotation/logout (single-use)                           |
| `replacedBy`      | String         | no  | successor `jti`                                                          |
| `userAgent`, `ip` | String         | no  | audit                                                                    |
| `createdAt`       | Date           |     |                                                                          |

Indexes: `{jti:1}` unique (every refresh) · `{family:1}` (revoke family) · `{userId:1}` (logout-all / deactivate) · `{expiresAt:1}` **TTL 0** (auto-delete expired).
Rotation is an atomic `findOneAndUpdate({jti, revokedAt:{$exists:false}})`, so concurrent refreshes with one token yield exactly one success. Replay of a rotated token after a 10 s grace window revokes the family.
Size ≈ 250 B/doc; docs per active session ≈ rotations within 30 d (TTL-bounded). Sharding: hashed `userId`.

### `addresses`

Purpose: saved delivery addresses (max 10 per user, enforced in service; separate collection, not embedded).

Fields: `userId` (ObjectId, req) · `label` (`home|work|other`, default home) · `name`, `phone`, `line1`, `city`, `state` (req) · `line2`, `landmark` · `pincode` (`^[1-9]\d{5}$`, req) · `location` GeoJSON Point `[lng,lat]` (optional) · `isDefault` (Boolean).
Indexes: `{userId:1,isDefault:-1,_id:-1}` (list, default first) · `{userId:1}` **unique partial `isDefault:true`** (DB-enforced single default; default switches run in a transaction) · `{location:'2dsphere'}` sparse (distance delivery charge, Phase 2).
Size ≈ 450 B; ≈ 1–3 per user.

### Redis keys (Phase 1, prefix `jkc:`)

| Key                  | TTL                   | Purpose                                                   |
| -------------------- | --------------------- | --------------------------------------------------------- |
| `otp:code:<phone>`   | `OTP_EXPIRES_SECONDS` | HMAC-SHA256 of the OTP (never plain)                      |
| `otp:att:<phone>`    | OTP TTL               | wrong-attempt counter                                     |
| `otp:lock:<phone>`   | 15 min                | lockout after `OTP_MAX_ATTEMPTS`                          |
| `otp:cool:<phone>`   | 30 s                  | resend cooldown                                           |
| `otp:hour:<phone>`   | 1 h                   | max 5 OTP requests/hour                                   |
| `login:fail:<email>` | 15 min                | password-login failure counter (lock at 5)                |
| `blocked:<userId>`   | access TTL + 60 s     | disabled-user flag checked on every authenticated request |
| `rl:<name>:<ip>`     | window                | express-rate-limit counters                               |

## Phase 2 collections

### `categories`

Fields: `name`(req ≤60) · `slug`(req, unique) · `description` · `image`{fileId,url,filePath,thumbnailUrl} · `sortOrder`(0) · `isActive`(true).
Indexes: `{slug:1}` unique (lookup/uniqueness) · `{isActive:1,sortOrder:1}` (public ordered list). Size ≈ 400 B, tens of docs. Cache: `catalog:categories` 300 s.

### `menuitems`

Fields: `name`(req) · `slug`(req, unique) · `description` · `categoryId`(→categories, req) · `isVeg`(req) · `price`(req, paise) · `mrp` · `taxPercent`(5) · `image` · `gallery`(≤4) · `variants`[{_id,name,price,isAvailable}] (≤10) · `addOns`[{_id,name,price,isVeg,isAvailable}] (≤20) · `tags`(≤10) · `prepTimeMinutes`(15) · `sortOrder` · `isAvailable`(true; stock toggle) · `isActive`(true; soft delete).
Embedded arrays are hard-bounded by validators, so documents stay < ~8 KB (typically 1–2 KB). Variant/add-on `_id`s are what the cart references.
Indexes: `{slug:1}` unique (detail by slug) · `{categoryId:1,isActive:1,sortOrder:1}` (category page) · `{isActive:1,isVeg:1,sortOrder:1}` (veg filter) · text `{name:10,tags:5,description:1}` (search box) · `{categoryId:1,_id:-1}` (admin list, cursor).
Cache: `catalog:list:<category>:<veg>:<available>` and `catalog:item:<idOrSlug>` 300 s; text searches are **not** cached (unbounded key space). Public list is capped at 500 items (the catalog is small by design); admin lists are cursor-paginated.

### `banners`

Fields: `title`(req) · `subtitle` · `image`(req) · `linkUrl` (in-app path or https) · `position` (`home_hero|home_secondary|menu|party`) · `sortOrder` · `startsAt`/`endsAt` · `isActive`.
Index: `{isActive:1,position:1,sortOrder:1}`. Cache: `banners:active` 120 s; the schedule window is applied at serve time, so banners start/stop on time without invalidation.

### `deliveryzones`

Fields: `name` · `kind` (`pincode|distance`) · `pincodes`[≤200] (kind=pincode) · `minKm`/`maxKm` (kind=distance, km from `CAFE_LAT/CAFE_LNG`; range is `(minKm, maxKm]`) · `deliveryCharge`(paise) · `freeDeliveryAbove`(paise) · `minOrderAmount`(paise; falls back to `MIN_ORDER_AMOUNT`×100) · `estimatedMinutes`(40) · `isActive`.
Indexes: `{pincodes:1,isActive:1}` (multikey) · `{isActive:1,kind:1,minKm:1}`. Resolution: pincode zone first, then distance tier (beyond `DEFAULT_DELIVERY_RADIUS_KM` ⇒ not serviceable). Cache: `zones:active` 600 s; quote math runs in memory.

### `coupons`, `couponredemptions`, `couponusages`

`coupons`: `code`(unique, uppercase) · `type` (`percent|flat`) · `value` (percent 1–100 or paise) · `maxDiscount` · `minOrderAmount` · `startsAt`/`expiresAt` · `usageLimit` · `perUserLimit`(1) · `usedCount` · `isPublic` · `isActive`. Indexes: `{code:1}` unique · `{isActive:1,isPublic:1,expiresAt:1}`.
`couponredemptions` (one per order; audit + idempotency): `couponId,userId,orderId,discount`; unique `{couponId:1,orderId:1}`.
`couponusages` (atomic per-user counter): `couponId,userId,count`; unique `{couponId:1,userId:1}` — the redeem transaction upserts with filter `count < perUserLimit`; hitting the limit makes the upsert collide with this unique index.
Redeem (one transaction): conditional `$inc usedCount` (guards `usageLimit`) → per-user counter → redemption doc; verified with 8-way concurrent tests. Growth: redemptions ≈ orders using coupons; shard by hashed `userId`/archive with orders.
Cache: `coupons:code:<CODE>` and `coupons:public` 60 s (usage counts are always re-read from the DB before a coupon is applied).

### Cache design (Redis)

Keys are `jkc:cache:<ns>:v<version>:<parts>`; namespaces: `catalog` (categories + menu), `banners`, `zones`, `coupons`. Every admin write calls `invalidate(ns)` which `INCR`s `jkc:cache:ver:<ns>` — O(1), no `SCAN`; stale entries just expire by TTL. Reads are single-flight per process (no stampede) and **fail open** if Redis is down. Public GETs also send `Cache-Control: public, max-age, s-maxage, stale-while-revalidate` + strong ETags (CDN-friendly; worst-case CDN staleness = `s-maxage`).

## Sharding & archiving strategy (preview; detailed per collection later)

- Shard only when a single replica set can't hold the working set (see `scaling.md`).
- Candidate keys: `orders` → `{ userId: "hashed" }` (even write spread; user history is single-shard) or `{ createdAt }` ranges with zones for archival; `notifications`/`reviews` → `{ userId: "hashed" }`; `users` → `{ _id: "hashed" }`. Catalog collections are small and stay unsharded.
- Archive delivered/cancelled orders older than N months to cold storage (`orders_archive`/object storage) via a BullMQ job.
