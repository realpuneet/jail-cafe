import { env } from '../config/env.js';
import { DeliveryZone } from '../models/DeliveryZone.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL, ZONE_KINDS } from '../utils/constants.js';

const EARTH_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

const activeZones = () =>
  cached('zones', ['active'], CACHE_TTL.ZONES, () => DeliveryZone.find({ isActive: true }).lean());

/**
 * Pure: pick the zone for a destination and compute the charge.
 * Pincode zones win over distance zones.
 * @param {object[]} zones active zones
 * @param {{pincode?: string, lat?: number, lng?: number, subtotal: number}} dest subtotal in paise
 * @param {{lat?: number, lng?: number}} [origin] cafe coordinates
 * @returns {{zoneId: string, zoneName: string, deliveryCharge: number, freeDeliveryApplied: boolean, minOrderAmount: number, estimatedMinutes: number, distanceKm?: number}}
 */
export function computeQuote(
  zones,
  { pincode, lat, lng, subtotal },
  origin = { lat: env.CAFE_LAT, lng: env.CAFE_LNG },
) {
  let zone = pincode
    ? zones.find((z) => z.kind === ZONE_KINDS.PINCODE && z.pincodes?.includes(pincode))
    : undefined;
  let distanceKm;

  if (
    !zone &&
    lat !== undefined &&
    lng !== undefined &&
    origin.lat !== undefined &&
    origin.lng !== undefined
  ) {
    distanceKm = haversineKm(origin.lat, origin.lng, lat, lng);
    zone = zones
      .filter((z) => z.kind === ZONE_KINDS.DISTANCE)
      .sort((a, b) => a.minKm - b.minKm)
      .find((z) => distanceKm > (z.minKm ?? 0) - 1e-9 && distanceKm <= z.maxKm);
    if (distanceKm > env.DEFAULT_DELIVERY_RADIUS_KM) zone = undefined;
  }
  if (!zone) throw ApiError.validation('Sorry, we do not deliver to this location yet');

  const free = zone.freeDeliveryAbove !== undefined && subtotal >= zone.freeDeliveryAbove;
  return {
    zoneId: String(zone._id),
    zoneName: zone.name,
    deliveryCharge: free ? 0 : zone.deliveryCharge,
    freeDeliveryApplied: free,
    minOrderAmount: zone.minOrderAmount ?? env.MIN_ORDER_AMOUNT * 100,
    estimatedMinutes: zone.estimatedMinutes,
    ...(distanceKm !== undefined ? { distanceKm: Math.round(distanceKm * 10) / 10 } : {}),
  };
}

/** Delivery quote for a destination (uses the cached active zones). */
export async function quote(dest) {
  return computeQuote(await activeZones(), dest);
}

/** Public coverage summary (no internals). */
export async function listPublic() {
  const zones = await activeZones();
  return zones.map(
    ({
      _id,
      name,
      kind,
      pincodes,
      minKm,
      maxKm,
      deliveryCharge,
      freeDeliveryAbove,
      estimatedMinutes,
    }) => ({
      _id,
      name,
      kind,
      pincodes,
      minKm,
      maxKm,
      deliveryCharge,
      freeDeliveryAbove,
      estimatedMinutes,
    }),
  );
}

export const listAdmin = () => DeliveryZone.find().sort({ _id: -1 }).limit(200).lean();

function assertShape(z) {
  if (z.kind === ZONE_KINDS.PINCODE && !z.pincodes?.length) {
    throw ApiError.validation('Pincode zones need at least one pincode');
  }
  if (z.kind === ZONE_KINDS.DISTANCE && (z.maxKm === undefined || (z.minKm ?? 0) >= z.maxKm)) {
    throw ApiError.validation('Distance zones need minKm < maxKm');
  }
}

export async function create(input) {
  assertShape(input);
  const doc = await DeliveryZone.create(input);
  await invalidate('zones');
  return doc.toObject();
}

export async function update(id, patch) {
  const current = await DeliveryZone.findById(id).lean();
  if (!current) throw ApiError.notFound('Delivery zone not found');
  assertShape({ ...current, ...patch });
  const doc = await DeliveryZone.findByIdAndUpdate(
    id,
    { $set: patch },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  await invalidate('zones');
  return doc;
}

export async function remove(id) {
  const doc = await DeliveryZone.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!doc) throw ApiError.notFound('Delivery zone not found');
  await invalidate('zones');
}
