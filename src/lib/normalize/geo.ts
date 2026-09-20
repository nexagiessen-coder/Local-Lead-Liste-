/** Geographic helpers — distance, bounding boxes, radius checks. */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceKm(a: LatLon, b: LatLon): number {
  return distanceMeters(a, b) / 1000;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Bounding box around a centre point — used to pre-filter SQL queries. */
export function boundingBox(center: LatLon, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32;
  const cos = Math.cos(toRadians(center.lat));
  const lonDelta = radiusKm / (111.32 * Math.max(0.01, Math.abs(cos)));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLon: center.lon - lonDelta,
    maxLon: center.lon + lonDelta,
  };
}

export function isWithinRadius(center: LatLon, point: LatLon, radiusKm: number): boolean {
  return distanceKm(center, point) <= radiusKm;
}

export function isValidLatLon(value: unknown): value is LatLon {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<LatLon>;
  return (
    typeof v.lat === 'number' &&
    typeof v.lon === 'number' &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lon) &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    v.lon >= -180 &&
    v.lon <= 180
  );
}
