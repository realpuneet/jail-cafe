# Database Design

> Living schema reference; each phase adds its collections (fields, indexes + the query each serves, enums, examples, caching, sizing). **Implemented so far: Phase 1** (`users`, `refreshtokens`, `addresses`) **Phase 2** (`categories`, `menuitems`, `banners`, `deliveryzones`, `coupons`, `couponredemptions`, `couponusages`) **Phase 3** (`carts`, `counters`, `orders`, `payments`, `paymentevents`, `notifications`) **Phase 5** (`bookingslots`, `slotinventories`, `tablebookings`) and **Phase 6** (`partypackages`, `partyinquiries`, `partydays`). All money fields are integer **paise**.

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

## Phase 3 collections

### State machines

**Order** (`orders.status`): `PLACED → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`; `CANCELLED` from PLACED/ACCEPTED/PREPARING/READY; `REJECTED` from PLACED. Pickup orders go `READY → DELIVERED`. Terminal: DELIVERED, CANCELLED, REJECTED.
Actors: admin/staff any legal move · customer only `PLACED → CANCELLED` · rider only `OUT_FOR_DELIVERY → DELIVERED` on orders assigned to them. Every move is an atomic compare-and-set on the current status (`findOneAndUpdate({_id, status: from})`) plus a `$push` to `statusHistory`; a concurrent loser gets 409.
**Payment** (`orders.payment.status`): online `pending → paid → (partially_)refunded`; COD `cod_pending → paid` (set when the order is DELIVERED). Online orders are invisible to the kitchen (board, `ACCEPTED`) until `paid`; unpaid ones auto-cancel after 15 min.
**Gateway payment** (`payments.status`): `created → captured → (partially_)refunded`, or `failed` (retryable; a later capture overrides it, a failure never downgrades a capture).

### `carts`

One doc per user (unique `userId`). `items[]` ≤ 50 lines: `{lineKey, menuItemId, variantId?, addOnIds[], quantity (1–20), note?}`; **no prices are stored** — the cart is re-priced from the live menu on every read. `couponCode?`, `expiresAt`.
Indexes: `{userId:1}` unique · `{expiresAt:1}` **TTL 0** (abandoned carts vanish 30 days after the last change). Adds are single atomic updates keyed by `lineKey` (hash of item/variant/add-ons/note), so concurrent taps never lose quantity.

### `counters`

`{_id: "order:YYMMDD", seq, expiresAt}` — atomic `$inc` upsert gives the daily order sequence (`JKC-YYMMDD-0001`, IST date). TTL index removes counters after 3 days.

### `orders`

Fields: `orderNumber`(unique) · `userId` · `type` (`delivery|pickup`) · `items[]` ≤ 50 **snapshots** `{menuItemId,name,isVeg,variantId,variantName,addOns[{addOnId,name,price}],unitPrice,quantity,lineTotal,taxPercent,note}` · `address` snapshot (+GeoJSON) · `pricing{subtotal,discount,deliveryCharge,taxIncluded,total}` (paise; tax is informational — menu prices are GST-inclusive) · `coupon{couponId,code,discount}` · `delivery{zoneId,zoneName,estimatedMinutes,distanceKm}` · `payment{method (online|cod),status,paidAt,refundedAmount}` · `status` · `statusHistory[]` (≤ 8 by construction: `{status,at,by,role,note}`) · `riderId` · `note` · `idempotencyKey` · `cancelReason` · `deliveredAt`.
Indexes: `{orderNumber:1}` unique · `{userId:1,_id:-1}` (my orders, cursor) · `{status:1,createdAt:1}` (live board) · `{riderId:1,status:1}` partial on riderId (rider app) · `{userId:1,idempotencyKey:1}` unique partial (idempotent placement backstop) · `{payment.status:1,createdAt:1}` partial on `pending` (expiry job) · `{createdAt:-1,status:1}` (analytics).
Size ≈ 2–4 KB; at 1 Cr users × ~20 orders ≈ 200 Cr docs ⇒ shard on hashed `userId` (user history stays on one shard) and archive terminal orders > 12 months to cold storage.
Placement is one transaction: order insert + coupon redemption + cart delete. Totals, delivery charge and discounts are always recomputed server-side.

### `payments`

Gateway attempts: `purpose (order|booking|party)` · `refId` · `userId` · `provider` · `providerOrderId` (unique) · `providerPaymentId` (unique partial) · `amount`(paise) · `currency` · `status` · `refundedAmount` · `refundIds[]` (gateway refund ids already applied) · `refundingSince` (short lock, 2 min, so two workers never refund the same payment) · `failureReason` · `capturedAt`. Index `{purpose:1,refId:1,_id:-1}`. `purpose/refId` let table and party deposits (Phases 5–6) reuse this collection.

### `paymentevents`

Webhook idempotency: `{eventId (unique), type, createdAt}`, TTL 90 days. If processing throws, the row is deleted so Razorpay's retry is processed.

### `notifications`

In-app inbox: `userId,type,title,body,data,readAt,dedupeKey (unique partial = queue+job id)`. Indexes `{userId:1,_id:-1}` (inbox) · `{userId:1,readAt:1}` (unread badge) · TTL 90 days.

### Redis keys (Phase 3)

| Key                                   | TTL    | Purpose                                                                          |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `idem:<userId>:<method>:<path>:<key>` | 24 h   | Idempotency record `{state: processing/done, body fingerprint, stored response}` |
| `rider:loc:<orderId>`                 | 10 min | Last rider location for late joiners                                             |
| `io:*`                                | —      | Socket.io Redis adapter channels                                                 |
| `bull:<queue>:*`                      | —      | BullMQ queues `notifications`, `notifications-dlq`, `payments`, `maintenance`    |

## Phase 5 collections (table booking)

**Booking state machine** (`tablebookings.status`): `HELD → CONFIRMED → COMPLETED | NO_SHOW`; `HELD → EXPIRED` (deposit not paid within 10 min, by the maintenance job); `HELD|CONFIRMED → CANCELLED`. Without a deposit a booking starts as `CONFIRMED`. Customers may cancel a confirmed booking until 2 h before start; staff any time. Cancel/expire release seats in the same transaction as the status change.

**Why double booking is impossible.** Capacity is tracked per _(slot, date)_ in one small document (`slotinventories`). A booking takes seats with a single conditional update — `findOneAndUpdate({slotId, date, $expr: booked + guests <= capacity}, {$inc: {booked: guests}})` — executed in the same transaction that inserts the booking. The filter is evaluated atomically on that one document, so two concurrent requests cannot both pass it; verified by tests that fire 12 simultaneous 2-guest bookings at 10 seats (exactly 5 succeed, `booked` ends at 10) and mixed party sizes (`booked` always equals the sum of live bookings). The inventory row is created beforehand with an upsert outside the transaction (duplicate-key safe).

### `bookingslots`

Repeating windows: `label` · `startTime`/`endTime` (`HH:mm` IST) · `capacity` (seats per day) · `maxPartySize`(10) · `daysOfWeek`[0–6] · `depositPerGuest` (paise, 0 = none) · `isActive`. Index `{isActive:1,startTime:1}`. Tens of docs.

### `slotinventories`

`{slotId, date "YYYY-MM-DD", capacity, booked, expiresAt}`. Indexes: `{slotId:1,date:1}` **unique** (the atomic seat counter) · `{date:1}` (availability for a day) · TTL on `expiresAt` (date + 90 days). 1 doc per slot per bookable day ⇒ a few hundred live docs.

### `tablebookings`

`bookingNumber` (`TB-YYMMDD-0001`, unique) · `userId` · `slotId` + `slot{label,startTime,endTime}` snapshot · `date` · `startsAt` (UTC instant) · `guests` · `name`,`phone`,`note` · `status` · `deposit{amount,status: none|pending|paid|refunded|partially_refunded}` · `holdExpiresAt` · `idempotencyKey` · `cancelledAt`,`cancelReason` · `statusHistory[]` (≤ 4).
Indexes: `{bookingNumber:1}` unique · `{userId:1,_id:-1}` (my bookings) · `{date:1,slotId:1,status:1}` (staff day view / calendar) · `{holdExpiresAt:1}` partial on `HELD` (hold-expiry job) · `{userId:1,idempotencyKey:1}` unique partial · `{userId:1,slotId:1,date:1}` **unique partial on HELD/CONFIRMED** (one live booking per user per slot per day).
Size ≈ 700 B. Deposits reuse `payments` with `purpose: "booking"`. Archive bookings older than 12 months; shard on hashed `userId`.

### Jobs & realtime (Phase 5)

`maintenance` queue: `expire-booking-holds` every minute. `reminders` queue: delayed `booking-reminder` (2 h before start, `jobId reminder-<id>`; the handler re-checks the booking is still confirmed, and cancel removes it). Socket events to the `staff` room: `booking:new`, `booking:update`.

## Phase 6 collections (party booking)

**Inquiry state machine** (`partyinquiries.status`): `SUBMITTED → QUOTED → ACCEPTED → CONFIRMED → COMPLETED`. Side exits: `QUOTED → DECLINED` (customer), `SUBMITTED|QUOTED|ACCEPTED → CLOSED` (admin cannot host), any open or confirmed state `→ CANCELLED`, `ACCEPTED → EXPIRED` (token not paid within 24 h) and `QUOTED → EXPIRED` (quote validity lapsed, default 3 days). An admin can re-quote while `SUBMITTED`/`QUOTED` (`quote.version` increments). `statusHistory` is the customer-visible timeline.

**Date reservation.** Accepting a quote takes one of the day's party slots (`PARTY_MAX_PER_DAY`, default 2) in the same transaction that flips the inquiry to `ACCEPTED`, using the same atomic conditional-`$inc` pattern as table seats (`partydays`). Full day ⇒ 409 and the transaction rolls back (the inquiry stays `QUOTED`). Declining, closing, cancelling and expiry release the slot atomically (`dateReserved` mirrors it). Tested with 5 concurrent accepts against 2 slots ⇒ exactly 2 succeed.

**Money.** All amounts are paise. `quote.amount` is the total, `quote.tokenAmount` (default 25 %, min ₹1) is the advance paid via Razorpay (`payments.purpose = "party"`). Cancelling a confirmed party at least 7 days ahead refunds the token; inside 7 days customers must call, staff can cancel with or without refund. A token captured after the window lapsed is refunded automatically.

### `partypackages`

`name`, `slug` (unique), `type` (`birthday|kitty|anniversary|corporate|other`), `tagline`, `description`, `image`, `pricePerGuest` (paise, "from"), `minGuests`, `maxGuests`, `durationHours`, `inclusions[]` (≤ 20), `sortOrder`, `isActive`. Indexes `{slug:1}` unique, `{isActive:1,sortOrder:1}`. Cached under the `catalog` namespace (`party`, `party-item`). Dozens of docs.

### `partyinquiries`

`inquiryNumber` (`PI-YYMMDD-0001`, unique) · `userId` · `packageId` + `package{name,type,pricePerGuest}` snapshot · `eventType` · `eventDate` (IST) · `startTime` · `guests` · contact `name/phone/email` · `requirements` · `status` · `quote{amount,tokenAmount,validUntil,notes,quotedBy,quotedAt,version}` · `token{amount,status,dueAt}` · `dateReserved` · `idempotencyKey` · `closeReason` · `statusHistory[]` (≤ ~12).
Indexes: `{inquiryNumber:1}` unique · `{userId:1,_id:-1}` (mine) · `{status:1,createdAt:1}` (admin inbox) · `{eventDate:1,status:1}` (event calendar) · `{token.dueAt:1}` partial on `ACCEPTED` and `{quote.validUntil:1}` partial on `QUOTED` (expiry job) · `{userId:1,idempotencyKey:1}` unique partial. At most 5 open inquiries per user. Size ≈ 1.5 KB.

### `partydays`

`{date, booked, capacity, expiresAt}`; unique `{date:1}` (the atomic counter), TTL on `expiresAt` (date + 30 days).

Jobs: `maintenance` → `expire-party-holds` every 5 min. Socket events to the `staff` room: `party:new`, `party:update`.

## Sharding & archiving strategy (preview; detailed per collection later)

- Shard only when a single replica set can't hold the working set (see `scaling.md`).
- Candidate keys: `orders` → `{ userId: "hashed" }` (even write spread; user history is single-shard) or `{ createdAt }` ranges with zones for archival; `notifications`/`reviews` → `{ userId: "hashed" }`; `users` → `{ _id: "hashed" }`. Catalog collections are small and stay unsharded.
- Archive delivered/cancelled orders older than N months to cold storage (`orders_archive`/object storage) via a BullMQ job.
