# Database Design

> Living schema reference; each phase adds its collections (fields, indexes + the query each serves, enums, examples, caching, sizing). **Implemented so far: Phase 1** (`users`, `refreshtokens`, `addresses`).

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

## Sharding & archiving strategy (preview; detailed per collection later)

- Shard only when a single replica set can't hold the working set (see `scaling.md`).
- Candidate keys: `orders` → `{ userId: "hashed" }` (even write spread; user history is single-shard) or `{ createdAt }` ranges with zones for archival; `notifications`/`reviews` → `{ userId: "hashed" }`; `users` → `{ _id: "hashed" }`. Catalog collections are small and stay unsharded.
- Archive delivered/cancelled orders older than N months to cold storage (`orders_archive`/object storage) via a BullMQ job.
