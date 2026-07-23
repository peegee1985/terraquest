/**
 * TQ-29: pure POI-discovery rules, dependency-free so they're unit-testable
 * without a Convex deployment (same convention as xpLedgerRules.ts /
 * questRules.ts).
 */

export type LatLng = { latitude: number; longitude: number };

export type PoiCategory = 'nature' | 'culture' | 'viewpoint' | 'gastronomy' | 'sport' | 'history';
export type PoiRarity = 'common' | 'rare';
export type PoiSafetyStatus = 'safe' | 'excluded';
export type PoiVisibility = 'public' | 'hidden';

export type Poi = {
  category: PoiCategory;
  rarity: PoiRarity;
  latitude: number;
  longitude: number;
  discoveryRadiusMeters: number;
  safetyStatus: PoiSafetyStatus;
  visibility: PoiVisibility;
};

// Docs 03 XP zdroje: common POI is capped at 10/day; rare POI has no fixed
// count cap ("dle definice" — decided per-POI, not a blanket daily count).
export const COMMON_POI_DAILY_CAP = 10;
export const COMMON_POI_REWARD_XP = 40;
// Docs 03 gives a 75-150 XP range for rare/area POI; a flat midpoint here,
// exact per-POI tuning is a later balance pass, not this task's scope.
export const RARE_POI_REWARD_XP = 100;

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A POI must be public and explicitly marked safe to ever be discoverable — sensitive/excluded categories (docs 02: "Citlivé objekty... jsou vyloučené") never pass, regardless of distance. */
export function isPubliclyDiscoverable(poi: Pick<Poi, 'safetyStatus' | 'visibility'>): boolean {
  return poi.safetyStatus === 'safe' && poi.visibility === 'public';
}

export function isWithinDiscoveryRadius(userLocation: LatLng, poi: Pick<Poi, 'latitude' | 'longitude' | 'discoveryRadiusMeters'>): boolean {
  return distanceMeters(userLocation, poi) <= poi.discoveryRadiusMeters;
}

export function poiRewardXp(rarity: PoiRarity): number {
  return rarity === 'rare' ? RARE_POI_REWARD_XP : COMMON_POI_REWARD_XP;
}

/** Whether a common-rarity discovery today would exceed the 10/day cap. Rare POI are never subject to this count cap. */
export function hasReachedCommonDailyCap(rarity: PoiRarity, commonDiscoveriesToday: number): boolean {
  return rarity === 'common' && commonDiscoveriesToday >= COMMON_POI_DAILY_CAP;
}
